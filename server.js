// Servidor do Gerador de Indicações: login, cadastro de usuários e entrega das páginas.
// Sem dependências externas: usa só os módulos do próprio Node.
//
// Variáveis de ambiente:
//   ADMIN_USER      usuário do administrador master (padrão: caio)
//   ADMIN_NAME      nome exibido do master (padrão: Caio Reis)
//   ADMIN_PASSWORD  senha do master. Obrigatória em produção.
//   SESSION_SECRET  chave que assina o cookie de sessão. Se faltar, é gerada e salva na pasta de dados.
//   DATA_DIR        onde fica o users.json. No Railway, use um volume (padrão: o volume do Railway ou ./data)
//   PORT            porta HTTP (o Railway define sozinho)

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSION_HOURS = 12;
const PROD = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === "production";

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- Chave da sessão ---------- */
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(DATA_DIR, ".session-secret");
  try { return fs.readFileSync(f, "utf8").trim() } catch {}
  const s = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();

/* ---------- Senhas ---------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
function checkPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored || "").split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), 64);
  const want = Buffer.from(hashHex, "hex");
  return want.length === hash.length && crypto.timingSafeEqual(hash, want);
}
const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString("hex"));

/* ---------- Usuários ---------- */
function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")) } catch { return [] }
}
function writeUsers(users) {
  const tmp = USERS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, USERS_FILE);
}
const normUser = s => String(s || "").trim().toLowerCase();
const publicUser = u => ({ id: u.id, username: u.username, name: u.name, role: u.role, master: !!u.master, createdAt: u.createdAt });

// O master vem sempre das variáveis de ambiente: não pode ser apagado pela tela.
function ensureMaster() {
  const users = readUsers();
  const username = normUser(process.env.ADMIN_USER || "caio");
  const name = process.env.ADMIN_NAME || "Caio Reis";
  let pw = process.env.ADMIN_PASSWORD;
  let m = users.find(u => u.master);
  if (!pw && !m) {
    if (PROD) { console.error("Defina ADMIN_PASSWORD nas variáveis do Railway antes de subir o sistema."); process.exit(1) }
    pw = crypto.randomBytes(9).toString("base64url");
    console.log(`\n[dev] Master criado: usuário "${username}", senha "${pw}". Defina ADMIN_PASSWORD para escolher outra.\n`);
  }
  if (!m) {
    m = { id: crypto.randomUUID(), master: true, role: "admin", createdAt: new Date().toISOString() };
    users.unshift(m);
  }
  m.username = username; m.name = name; m.role = "admin";
  if (process.env.ADMIN_PASSWORD) { if (!checkPassword(pw, m.password)) { m.password = hashPassword(pw); m.sv = (m.sv || 0) + 1 } }
  else if (!m.password) m.password = hashPassword(pw);
  // outro usuário com o mesmo login do master perde o login
  for (const u of users) if (!u.master && u.username === username) u.username = username + "-" + u.id.slice(0, 4);
  writeUsers(users);
}
ensureMaster();

/* ---------- Sessão (cookie assinado) ---------- */
const sign = s => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
function makeToken(u) {
  const body = Buffer.from(JSON.stringify({ id: u.id, sv: u.sv || 0, exp: Date.now() + SESSION_HOURS * 3600e3 })).toString("base64url");
  return body + "." + sign(body);
}
function readSession(req) {
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || "");
  if (!m) return null;
  const [body, sig] = m[1].split(".");
  if (!body || !sig) return null;
  const want = sign(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  let data; try { data = JSON.parse(Buffer.from(body, "base64url").toString()) } catch { return null }
  if (!data.exp || data.exp < Date.now()) return null;
  const u = readUsers().find(x => x.id === data.id);
  if (!u || (u.sv || 0) !== data.sv) return null;   // senha trocada ou usuário apagado: sessão cai
  return u;
}
const cookie = (val, maxAge) =>
  `sid=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${PROD ? "; Secure" : ""}`;

/* ---------- Limite de tentativas de login ---------- */
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now(), a = (attempts.get(ip) || []).filter(t => now - t < 15 * 60e3);
  attempts.set(ip, a);
  return a.length >= 10;
}
const failed = ip => attempts.get(ip).push(Date.now());

/* ---------- HTTP ---------- */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
};
function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const json = (res, status, obj, headers = {}) =>
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > 1e5) { reject(new Error("grande")); req.destroy() } else chunks.push(c) });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}")) } catch { reject(new Error("json")) } });
    req.on("error", reject);
  });
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
// Só estes arquivos são servidos. O resto (server.js, data/) nunca sai do servidor.
const PUBLIC = { "/login": "login.html", "/login.html": "login.html" };
const PRIVATE = { "/": "index.html", "/index.html": "index.html", "/indicacoes-assets.js": "indicacoes-assets.js", "/app-auth.js": "app-auth.js" };

function serveFile(res, file) {
  fs.readFile(path.join(ROOT, file), (err, buf) => {
    if (err) return send(res, 404, "Não encontrado");
    const ext = path.extname(file);
    send(res, 200, buf, { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": ext === ".html" ? "no-store" : "private, max-age=3600" });
  });
}

const PW_MIN = 8;
function validateNew({ username, name, password, role }, users) {
  const un = normUser(username);
  if (!/^[a-z0-9._-]{3,32}$/.test(un)) return "Usuário deve ter de 3 a 32 letras, números, ponto, hífen ou sublinhado, sem espaços.";
  if (users.some(u => u.username === un)) return "Já existe um usuário com esse login.";
  if (!String(name || "").trim()) return "Informe o nome.";
  if (String(password || "").length < PW_MIN) return `A senha precisa ter pelo menos ${PW_MIN} caracteres.`;
  if (!["admin", "usuario"].includes(role)) return "Perfil inválido.";
  return null;
}

async function api(req, res, url) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  const route = req.method + " " + url.pathname;

  // Pedidos que mudam algo precisam vir do próprio site.
  if (req.method !== "GET") {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: "Origem não permitida." });
  }

  if (route === "POST /api/login") {
    if (tooMany(ip)) return json(res, 429, { error: "Muitas tentativas. Aguarde 15 minutos e tente de novo." });
    const b = await readBody(req);
    const u = readUsers().find(x => x.username === normUser(b.username));
    const ok = checkPassword(String(b.password || ""), u ? u.password : DUMMY_HASH) && !!u;
    if (!ok) { failed(ip); return json(res, 401, { error: "Usuário ou senha incorretos." }) }
    attempts.delete(ip);
    return json(res, 200, { user: publicUser(u) }, { "Set-Cookie": cookie(makeToken(u), SESSION_HOURS * 3600) });
  }
  if (route === "POST /api/logout") return json(res, 200, { ok: true }, { "Set-Cookie": cookie("", 0) });

  const me = readSession(req);
  if (!me) return json(res, 401, { error: "Sessão expirada. Entre de novo." });

  if (route === "GET /api/me") return json(res, 200, { user: publicUser(me) });

  if (route === "POST /api/me/password") {
    const b = await readBody(req);
    if (!checkPassword(String(b.current || ""), me.password)) return json(res, 400, { error: "A senha atual está incorreta." });
    if (me.master && process.env.ADMIN_PASSWORD) return json(res, 400, { error: "A senha do master é definida na variável ADMIN_PASSWORD do Railway." });
    if (String(b.password || "").length < PW_MIN) return json(res, 400, { error: `A nova senha precisa ter pelo menos ${PW_MIN} caracteres.` });
    const users = readUsers(), u = users.find(x => x.id === me.id);
    u.password = hashPassword(b.password); u.sv = (u.sv || 0) + 1; writeUsers(users);
    return json(res, 200, { ok: true }, { "Set-Cookie": cookie(makeToken(u), SESSION_HOURS * 3600) });
  }

  if (!url.pathname.startsWith("/api/users")) return json(res, 404, { error: "Não encontrado." });
  if (me.role !== "admin") return json(res, 403, { error: "Só administradores podem gerenciar usuários." });

  if (route === "GET /api/users") return json(res, 200, { users: readUsers().map(publicUser) });

  if (route === "POST /api/users") {
    const b = await readBody(req), users = readUsers();
    const err = validateNew(b, users);
    if (err) return json(res, 400, { error: err });
    const u = { id: crypto.randomUUID(), username: normUser(b.username), name: String(b.name).trim().slice(0, 80),
      role: b.role, password: hashPassword(String(b.password)), createdAt: new Date().toISOString(), createdBy: me.username };
    users.push(u); writeUsers(users);
    return json(res, 201, { user: publicUser(u) });
  }

  const m = /^\/api\/users\/([\w-]+)(\/password)?$/.exec(url.pathname);
  if (!m) return json(res, 404, { error: "Não encontrado." });
  const users = readUsers(), target = users.find(u => u.id === m[1]);
  if (!target) return json(res, 404, { error: "Usuário não encontrado." });
  if (target.master && !me.master) return json(res, 403, { error: "Só o master pode alterar a própria conta." });

  if (req.method === "DELETE" && !m[2]) {
    if (target.master) return json(res, 400, { error: "O administrador master não pode ser removido." });
    if (target.id === me.id) return json(res, 400, { error: "Você não pode remover a própria conta." });
    writeUsers(users.filter(u => u.id !== target.id));
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && m[2]) {
    if (target.master) return json(res, 400, { error: "A senha do master é definida na variável ADMIN_PASSWORD do Railway." });
    const b = await readBody(req);
    if (String(b.password || "").length < PW_MIN) return json(res, 400, { error: `A senha precisa ter pelo menos ${PW_MIN} caracteres.` });
    target.password = hashPassword(String(b.password)); target.sv = (target.sv || 0) + 1; writeUsers(users);
    return json(res, 200, { ok: true });
  }
  if (req.method === "PATCH" && !m[2]) {
    if (target.master) return json(res, 400, { error: "O perfil do master não pode ser alterado." });
    const b = await readBody(req);
    if (b.role && ["admin", "usuario"].includes(b.role)) target.role = b.role;
    if (b.name && String(b.name).trim()) target.name = String(b.name).trim().slice(0, 80);
    writeUsers(users);
    return json(res, 200, { user: publicUser(target) });
  }
  return json(res, 404, { error: "Não encontrado." });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/health") return send(res, 200, "ok");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Método não permitido");

    if (PUBLIC[url.pathname]) {
      if (url.pathname.startsWith("/login") && readSession(req)) return send(res, 302, "", { Location: "/" });
      return serveFile(res, PUBLIC[url.pathname]);
    }
    if (PRIVATE[url.pathname] || !path.extname(url.pathname)) {
      if (!readSession(req)) return send(res, 302, "", { Location: "/login", "Cache-Control": "no-store" });
      return serveFile(res, PRIVATE[url.pathname] || "index.html");
    }
    send(res, 404, "Não encontrado");
  } catch (err) {
    if (err.message === "json" || err.message === "grande") return json(res, 400, { error: "Pedido inválido." });
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: "Erro no servidor." });
  }
}).listen(PORT, () => console.log(`Gerador de Indicações em http://localhost:${PORT} (dados em ${DATA_DIR})`));
