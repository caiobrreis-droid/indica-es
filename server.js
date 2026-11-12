// Servidor do Gerador de Indicações: login, gabinetes, usuários e entrega das páginas.
// Sem dependências externas: usa só os módulos do próprio Node.
//
// Perfis:
//   master   você. Cria gabinetes e o administrador de cada um. Vem das variáveis de ambiente.
//   admin    administrador de um gabinete (o vereador). Configura o timbrado e cadastra assessores.
//   usuario  assessor. Só gera indicações no timbrado do próprio gabinete.
//
// Variáveis de ambiente:
//   ADMIN_USER      login do master (padrão: caio)
//   ADMIN_NAME      nome exibido do master (padrão: Caio Reis)
//   ADMIN_PASSWORD  senha do master. Obrigatória em produção.
//   SESSION_SECRET  chave que assina o cookie de sessão. Se faltar, é gerada e salva na pasta de dados.
//   DATA_DIR        onde ficam os dados. No Railway, use um volume (padrão: o volume do Railway ou ./data)
//   PORT            porta HTTP (o Railway define sozinho)

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const GABS_FILE = path.join(DATA_DIR, "gabinetes.json");
const GABS_DIR = path.join(DATA_DIR, "gabinetes");
const SESSION_HOURS = 12;
const PROD = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === "production";
let setupError = null;   // quando falta configuração, o site mostra o aviso em vez de cair

// No Railway, só o que está num volume sobrevive a um deploy. Fora dele, usuários e gabinetes somem.
const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH;
const PERSISTENT = !PROD || (!!VOLUME && path.resolve(DATA_DIR).startsWith(path.resolve(VOLUME)));
if (!PERSISTENT) console.error(`ATENÇÃO: os dados estão em ${DATA_DIR}, fora de um volume. Eles serão apagados no próximo deploy. Crie um volume no serviço do Railway.`);

fs.mkdirSync(GABS_DIR, { recursive: true });

/* ---------- Arquivos JSON ---------- */
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")) } catch { return [] } }
function writeJson(f, data) {
  const tmp = f + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, f);
}
const readUsers = () => readJson(USERS_FILE);
const writeUsers = u => writeJson(USERS_FILE, u);
const readGabs = () => readJson(GABS_FILE);
const writeGabs = g => writeJson(GABS_FILE, g);

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
  return `scrypt$${salt.toString("hex")}$${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}
function checkPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored || "").split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), 64);
  const want = Buffer.from(hashHex, "hex");
  return want.length === hash.length && crypto.timingSafeEqual(hash, want);
}
const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString("hex"));

/* ---------- Gabinetes ---------- */
const CONFIG_FIELDS = {
  vereador: 120, prefeito: 120, presidente: 120, municipio: 80, uf: 2, artigo: 80, justif: 3000, sapl: 200,
};
const SELO_POS = ["inferior", "superior"];   // canto da foto onde vai o selo (sempre à esquerda)
const DEFAULT_CONFIG = {
  vereador: "", prefeito: "", presidente: "", municipio: "Boa Vista", uf: "RR", artigo: "art. 110, IX", seloPos: "inferior",
  sapl: "https://sapl.boavista.rr.leg.br",
  justif: "A indicação ora apresentada visa reforçar a solicitação dos moradores, para que possa melhorar as condições de tráfego de todos que transitam pela via, assim sendo, solicito que seja incluída no cronograma de obras do município a realização desse serviço. Certo de contar com o atendimento a esta indicação, reitero os meus votos de estima e apreço.",
};
// Modelos de serviço que todo gabinete novo recebe. O admin do gabinete pode adicionar e remover;
// os assessores só usam.
const DEFAULT_SERVICES = [
  { nome: "Calçada", texto: "PROMOVA A CONSTRUÇÃO DE CALÇADA" },
  { nome: "Tapa-buraco", texto: "PROMOVA A OPERAÇÃO TAPA-BURACO" },
  { nome: "Faixa de pedestre", texto: "PROMOVA A PINTURA DE FAIXA DE PEDESTRE" },
  { nome: "Redutor de velocidade", texto: "PROMOVA A INSTALAÇÃO DE REDUTOR DE VELOCIDADE" },
  { nome: "Abrigo de ônibus", texto: "PROMOVA A INSTALAÇÃO DE ABRIGO NO PONTO DE ÔNIBUS" },
  { nome: "Drenagem", texto: "PROMOVA A CONSTRUÇÃO DE SISTEMA DE DRENAGEM PLUVIAL" },
  { nome: "Meio Fio", texto: "PROMOVA A CONSTRUÇÃO DE MEIO-FIO" },
  { nome: "Sinalização", texto: "PROMOVA A SINALIZAÇÃO HORIZONTAL E VERTICAL" },
  { nome: "Recapeamento Asfáltico", texto: "PROMOVA O RECAPEAMENTO ASFÁLTICO" },
  { nome: "Serviço de Limpeza", texto: "PROMOVA O SERVIÇO DE LIMPEZA" },
  { nome: "Pavimentação Asfáltica", texto: "PROMOVA A PAVIMENTAÇÃO ASFÁLTICA" },
  { nome: "Manutenção de Calçada", texto: "PROMOVA A MANUTENÇÃO DA CALÇADA" },
  { nome: "Identificação de Placas", texto: "PROMOVA A INSTALAÇÃO DE PLACAS DE IDENTIFICAÇÃO" },
  { nome: "Construção de Galerias", texto: "PROMOVA A CONSTRUÇÃO DE GALERIAS PLUVIAIS" },
  { nome: "Instalação de Semáforo", texto: "PROMOVA A INSTALAÇÃO DE SEMÁFORO" },
  { nome: "Revitalização de Faixa de Pedestre", texto: "PROMOVA A REVITALIZAÇÃO DA FAIXA DE PEDESTRE" },
  { nome: "Revitalização de Praça", texto: "PROMOVA A REVITALIZAÇÃO DA PRAÇA" },
  { nome: "Iluminação pública", texto: "PROMOVA A MANUTENÇÃO E AMPLIAÇÃO DA ILUMINAÇÃO PÚBLICA" },
  { nome: "Limpeza de bueiros", texto: "PROMOVA A LIMPEZA E DESOBSTRUÇÃO DOS BUEIROS" },
  { nome: "Poda de árvores", texto: "PROMOVA A PODA DAS ÁRVORES" },
];
const MAX_SERVICES = 200;
function cleanService(s) {
  const nome = String((s && s.nome) || "").trim().replace(/\s+/g, " ").slice(0, 80);
  const texto = String((s && s.texto) || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR").slice(0, 400);
  return nome && texto ? { nome, texto } : null;
}
const ASSET_KINDS = ["timbrado", "selo"];
const assetPath = (gid, kind) => path.join(GABS_DIR, gid, kind + ".png");
const hasAsset = (gid, kind) => fs.existsSync(assetPath(gid, kind));
const publicGab = g => ({ id: g.id, nome: g.nome, ativo: g.ativo !== false, createdAt: g.createdAt,
  config: { ...DEFAULT_CONFIG, ...g.config }, timbrado: hasAsset(g.id, "timbrado"), selo: hasAsset(g.id, "selo"),
  services: g.services || DEFAULT_SERVICES, servicesSaved: Array.isArray(g.services) });
function cleanConfig(input) {
  const out = {};
  for (const [k, max] of Object.entries(CONFIG_FIELDS)) if (input[k] != null) out[k] = String(input[k]).trim().slice(0, max);
  if (out.uf) out.uf = out.uf.toUpperCase();
  if (SELO_POS.includes(input.seloPos)) out.seloPos = input.seloPos;
  if (out.sapl != null && out.sapl && !/^https:\/\/[^\s/]+\.[^\s/]+\/?$/i.test(out.sapl)) delete out.sapl;   // só endereço https do SAPL
  if (out.sapl) out.sapl = out.sapl.replace(/\/$/, "");
  return out;
}

/* ---------- Usuários ---------- */
const normUser = s => String(s || "").trim().toLowerCase();
const publicUser = u => ({ id: u.id, username: u.username, name: u.name, role: u.role, master: !!u.master,
  gabinetId: u.gabinetId || null, createdAt: u.createdAt });

// O master vem sempre das variáveis de ambiente: não pode ser apagado pela tela.
function ensureMaster() {
  const users = readUsers();
  const username = normUser(process.env.ADMIN_USER || "caio");
  let pw = process.env.ADMIN_PASSWORD;
  let m = users.find(u => u.master);
  if (!pw && !m) {
    if (PROD) {
      setupError = "Falta a variável ADMIN_PASSWORD no Railway. Abra o serviço, vá em Variables, crie ADMIN_PASSWORD com a senha do master e faça um novo deploy.";
      console.error(setupError);
      return;
    }
    pw = crypto.randomBytes(9).toString("base64url");
    console.log(`\n[dev] Master criado: usuário "${username}", senha "${pw}". Defina ADMIN_PASSWORD para escolher outra.\n`);
  }
  if (!m) { m = { id: crypto.randomUUID(), master: true, createdAt: new Date().toISOString() }; users.unshift(m) }
  m.username = username; m.name = process.env.ADMIN_NAME || "Caio Reis"; m.role = "master"; delete m.gabinetId;
  if (process.env.ADMIN_PASSWORD) { if (!checkPassword(pw, m.password)) { m.password = hashPassword(pw); m.sv = (m.sv || 0) + 1 } }
  else if (!m.password) m.password = hashPassword(pw);
  for (const u of users) if (!u.master && u.username === username) u.username = username + "-" + u.id.slice(0, 4);
  writeUsers(users);
}

// Primeira vez com gabinetes: cria o gabinete do Júlio Cézar com o timbrado que já existia
// e coloca nele os usuários cadastrados antes.
function julioAssets() {
  try {
    const src = fs.readFileSync(path.join(ROOT, "indicacoes-assets.js"), "utf8");
    const assets = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
    return Object.fromEntries(ASSET_KINDS.filter(k => assets[k]).map(k => [k, Buffer.from(assets[k].split(",")[1], "base64")]));
  } catch (err) { console.error("Não consegui ler o timbrado do Júlio:", err.message); return {} }
}
function migrate() {
  if (fs.existsSync(GABS_FILE)) return upgradeJulio();
  const id = crypto.randomUUID();
  const gab = { id, nome: "Gabinete Vereador Júlio Cézar Medeiros Lima", ativo: true, createdAt: new Date().toISOString(),
    config: { ...DEFAULT_CONFIG, vereador: "JÚLIO CÉZAR MEDEIROS LIMA - MDB", prefeito: "Marcelo Zeitoune", presidente: "Genilson Costa e Silva" } };
  fs.mkdirSync(path.join(GABS_DIR, id), { recursive: true });
  for (const [k, buf] of Object.entries(julioAssets())) fs.writeFileSync(assetPath(id, k), buf);
  writeGabs([gab]);
  const users = readUsers();
  for (const u of users) if (!u.master && !u.gabinetId) u.gabinetId = id;
  writeUsers(users);
  console.log("Gabinete inicial criado:", gab.nome);
}
// Modelo de novembro de 2026: troca o timbrado e o selo do Júlio pelos novos,
// mas só onde ainda estão as versões anteriores (nunca sobrescreve um envio feito pela tela).
const OLD_JULIO = {
  timbrado: [
    "b67ee9b8ba0782b198159b415a79bd64f08830fe03314a581879713a9c96241d",   // modelo original
    "26465e82bfddda13a26457f71973d9a9c8652f2f6c53275933923ec594b66f89",   // modelo novo com o brasão fora do centro
  ],
  selo: ["fba2f0396041dbde056d3cf3e61b2a66ee1b3a52919ab6bdcbdc49231bb058e7"],   // selo "Filho de Roraima": volta para o selo com a foto
};
function upgradeJulio() {
  const gabs = readGabs(); let assets = null, changed = false;
  for (const g of gabs) for (const k of ASSET_KINDS) {
    let buf; try { buf = fs.readFileSync(assetPath(g.id, k)) } catch { continue }
    if (!OLD_JULIO[k].includes(crypto.createHash("sha256").update(buf).digest("hex"))) continue;
    assets ||= julioAssets();
    if (!assets[k]) continue;
    fs.writeFileSync(assetPath(g.id, k), assets[k]);
    if (k === "selo") { g.config = { ...g.config, seloPos: "inferior" }; changed = true }
    console.log(`Modelo novo aplicado: ${k} de ${g.nome}`);
  }
  if (changed) writeGabs(gabs);
}
ensureMaster();
migrate();

/* ---------- Sessão (cookie assinado) ---------- */
const sign = s => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
function makeToken(u) {
  const body = Buffer.from(JSON.stringify({ id: u.id, sv: u.sv || 0, exp: Date.now() + SESSION_HOURS * 3600e3 })).toString("base64url");
  return body + "." + sign(body);
}
// Gabinete bloqueado ou apagado derruba o acesso de todo mundo dele.
function gabOk(u) {
  if (u.master) return true;
  const g = readGabs().find(x => x.id === u.gabinetId);
  return !!g && g.ativo !== false;
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
  if (!u || (u.sv || 0) !== data.sv || !gabOk(u)) return null;   // senha trocada, usuário apagado ou gabinete bloqueado
  return u;
}
const cookie = (val, maxAge) => `sid=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${PROD ? "; Secure" : ""}`;

/* ---------- Limite de tentativas de login ---------- */
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now(), a = (attempts.get(ip) || []).filter(t => now - t < 15 * 60e3);
  attempts.set(ip, a);
  return a.length >= 10;
}
const failed = ip => attempts.get(ip).push(Date.now());

/* ---------- HTTP ---------- */
const SECURITY_HEADERS = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY" };
function send(res, status, body, headers = {}) { res.writeHead(status, { ...SECURITY_HEADERS, ...headers }); res.end(body) }
const json = (res, status, obj, headers = {}) =>
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status } }

function readBody(req, limit = 1e5) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new HttpError(413, "Arquivo grande demais.")); req.destroy() } else chunks.push(c) });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}")) } catch { reject(new HttpError(400, "Pedido inválido.")) } });
    req.on("error", reject);
  });
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png" };
// Só estes arquivos são servidos. O resto (server.js, data/) nunca sai do servidor.
// sapl-lote.js é carregado pela página do SAPL (outro site, sem o nosso login), então é público.
// Ele não tem nenhum dado: só o código do painel de envio em lote.
const PUBLIC = { "/login": "login.html", "/login.html": "login.html", "/sapl-lote.js": "sapl-lote.js" };
const PRIVATE = { "/": "index.html", "/index.html": "index.html", "/app-auth.js": "app-auth.js" };

function serveFile(res, file) {
  fs.readFile(path.join(ROOT, file), (err, buf) => {
    if (err) return send(res, 404, "Não encontrado");
    const ext = path.extname(file);
    send(res, 200, buf, { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
  });
}

const PW_MIN = 8;
function checkNewUser({ username, name, password }, users) {
  const un = normUser(username);
  if (!String(name || "").trim()) return "Informe o nome.";
  if (!/^[a-z0-9._-]{3,32}$/.test(un)) return "O login deve ter de 3 a 32 letras, números, ponto, hífen ou sublinhado, sem espaços.";
  if (users.some(u => u.username === un)) return "Já existe alguém com esse login.";
  if (String(password || "").length < PW_MIN) return `A senha precisa ter pelo menos ${PW_MIN} caracteres.`;
  return null;
}
const newUser = (b, role, gabinetId, by) => ({ id: crypto.randomUUID(), username: normUser(b.username), name: String(b.name).trim().slice(0, 80),
  role, gabinetId, password: hashPassword(String(b.password)), createdAt: new Date().toISOString(), createdBy: by.username });

// Qual gabinete o pedido está mexendo: o master escolhe pelo ?g=, os outros só o próprio.
function targetGab(me, url) {
  const id = me.master ? url.searchParams.get("g") : me.gabinetId;
  const g = readGabs().find(x => x.id === id);
  if (!g) throw new HttpError(404, me.master ? "Escolha um gabinete." : "Gabinete não encontrado.");
  return g;
}
const canManage = me => me.master || me.role === "admin";

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
    if (!gabOk(u)) return json(res, 403, { error: "O acesso deste gabinete está suspenso. Fale com o administrador do sistema." });
    attempts.delete(ip);
    return json(res, 200, { user: publicUser(u) }, { "Set-Cookie": cookie(makeToken(u), SESSION_HOURS * 3600) });
  }
  if (route === "POST /api/logout") return json(res, 200, { ok: true }, { "Set-Cookie": cookie("", 0) });

  const me = readSession(req);
  if (!me) return json(res, 401, { error: "Sessão expirada. Entre de novo." });

  if (route === "GET /api/me") return json(res, 200, { user: publicUser(me), ...(me.master ? { storage: { persistent: PERSISTENT, dir: DATA_DIR } } : {}) });

  if (route === "POST /api/me/password") {
    const b = await readBody(req);
    if (!checkPassword(String(b.current || ""), me.password)) return json(res, 400, { error: "A senha atual está incorreta." });
    if (me.master && process.env.ADMIN_PASSWORD) return json(res, 400, { error: "A senha do master é definida na variável ADMIN_PASSWORD do Railway." });
    if (String(b.password || "").length < PW_MIN) return json(res, 400, { error: `A nova senha precisa ter pelo menos ${PW_MIN} caracteres.` });
    const users = readUsers(), u = users.find(x => x.id === me.id);
    u.password = hashPassword(b.password); u.sv = (u.sv || 0) + 1; writeUsers(users);
    return json(res, 200, { ok: true }, { "Set-Cookie": cookie(makeToken(u), SESSION_HOURS * 3600) });
  }

  /* ----- Gabinetes (só o master) ----- */
  if (url.pathname.startsWith("/api/gabinetes")) {
    if (!me.master) return json(res, 403, { error: "Só o administrador master gerencia gabinetes." });
    if (route === "GET /api/gabinetes") {
      const users = readUsers();
      return json(res, 200, { gabinetes: readGabs().map(g => ({ ...publicGab(g),
        usuarios: users.filter(u => u.gabinetId === g.id).length,
        admins: users.filter(u => u.gabinetId === g.id && u.role === "admin").map(u => u.username) })) });
    }
    if (route === "POST /api/gabinetes") {
      const b = await readBody(req), users = readUsers(), gabs = readGabs();
      const nome = String(b.nome || "").trim().slice(0, 120);
      if (!nome) return json(res, 400, { error: "Informe o nome do gabinete." });
      const err = checkNewUser(b, users);
      if (err) return json(res, 400, { error: err });
      const g = { id: crypto.randomUUID(), nome, ativo: true, createdAt: new Date().toISOString(),
        config: { ...DEFAULT_CONFIG, vereador: String(b.name).trim().toLocaleUpperCase("pt-BR") } };
      fs.mkdirSync(path.join(GABS_DIR, g.id), { recursive: true });
      gabs.push(g); writeGabs(gabs);
      users.push(newUser(b, "admin", g.id, me)); writeUsers(users);
      return json(res, 201, { gabinete: publicGab(g) });
    }
    const m = /^\/api\/gabinetes\/([\w-]+)$/.exec(url.pathname);
    const gabs = readGabs(), g = m && gabs.find(x => x.id === m[1]);
    if (!g) return json(res, 404, { error: "Gabinete não encontrado." });
    if (req.method === "PATCH") {
      const b = await readBody(req);
      if (typeof b.ativo === "boolean") g.ativo = b.ativo;
      if (b.nome && String(b.nome).trim()) g.nome = String(b.nome).trim().slice(0, 120);
      writeGabs(gabs);
      return json(res, 200, { gabinete: publicGab(g) });
    }
    if (req.method === "DELETE") {
      writeGabs(gabs.filter(x => x.id !== g.id));
      writeUsers(readUsers().filter(u => u.gabinetId !== g.id));
      fs.rmSync(path.join(GABS_DIR, g.id), { recursive: true, force: true });
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: "Não encontrado." });
  }

  /* ----- Configuração do gabinete ----- */
  if (url.pathname === "/api/gabinete" || url.pathname.startsWith("/api/gabinete/")) {
    const gabs = readGabs(), g = gabs.find(x => x.id === targetGab(me, url).id);
    if (route === "GET /api/gabinete") return json(res, 200, { gabinete: publicGab(g) });
    const am = /^\/api\/gabinete\/asset\/(timbrado|selo)$/.exec(url.pathname);
    if (am && req.method === "GET") {
      if (!hasAsset(g.id, am[1])) return send(res, 404, "Sem imagem");
      return send(res, 200, fs.readFileSync(assetPath(g.id, am[1])), { "Content-Type": "image/png", "Cache-Control": "no-cache" });
    }
    if (!canManage(me)) return json(res, 403, { error: "Só o administrador do gabinete pode mudar as configurações." });
    if (url.pathname === "/api/gabinete/services") {
      const list = (g.services || DEFAULT_SERVICES).map(s => ({ ...s }));
      const b = req.method === "DELETE" ? {} : await readBody(req);
      if (req.method === "PUT") {
        // usado uma vez para trazer a lista que o admin tinha montado no próprio navegador
        if (b.onlyIfUnsaved && Array.isArray(g.services)) return json(res, 200, { gabinete: publicGab(g) });
        const seen = new Set(), clean = [];
        for (const s of Array.isArray(b.services) ? b.services : []) { const c = cleanService(s); if (c && !seen.has(c.nome.toLowerCase())) { seen.add(c.nome.toLowerCase()); clean.push(c) } }
        if (!clean.length) return json(res, 400, { error: "A lista de serviços está vazia." });
        g.services = clean.slice(0, MAX_SERVICES);
      } else if (req.method === "POST") {
        const c = cleanService(b);
        if (!c) return json(res, 400, { error: "Preencha o nome e o texto do serviço." });
        if (list.some(s => s.nome.toLowerCase() === c.nome.toLowerCase())) return json(res, 400, { error: "Já existe um serviço com esse nome." });
        if (list.length >= MAX_SERVICES) return json(res, 400, { error: "Limite de serviços atingido." });
        g.services = [...list, c];
      } else if (req.method === "DELETE") {
        const nome = String(url.searchParams.get("nome") || "").toLowerCase();
        g.services = list.filter(s => s.nome.toLowerCase() !== nome);
      } else return json(res, 404, { error: "Não encontrado." });
      writeGabs(gabs);
      return json(res, 200, { gabinete: publicGab(g) });
    }
    if (route === "PUT /api/gabinete") {
      const b = await readBody(req);
      g.config = { ...DEFAULT_CONFIG, ...g.config, ...cleanConfig(b.config || {}) };
      writeGabs(gabs);
      return json(res, 200, { gabinete: publicGab(g) });
    }
    if (am && req.method === "PUT") {
      const b = await readBody(req, 8e6);
      const mm = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dataUrl || ""));
      const buf = mm && Buffer.from(mm[1], "base64");
      if (!buf || buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return json(res, 400, { error: "Envie uma imagem PNG ou JPG." });
      fs.mkdirSync(path.join(GABS_DIR, g.id), { recursive: true });
      fs.writeFileSync(assetPath(g.id, am[1]), buf);
      return json(res, 200, { gabinete: publicGab(g) });
    }
    if (am && req.method === "DELETE") {
      fs.rmSync(assetPath(g.id, am[1]), { force: true });
      return json(res, 200, { gabinete: publicGab(g) });
    }
    return json(res, 404, { error: "Não encontrado." });
  }

  /* ----- Usuários de um gabinete ----- */
  if (!url.pathname.startsWith("/api/users")) return json(res, 404, { error: "Não encontrado." });
  if (!canManage(me)) return json(res, 403, { error: "Só administradores podem gerenciar usuários." });
  const g = targetGab(me, url);

  if (route === "GET /api/users")
    return json(res, 200, { users: readUsers().filter(u => u.gabinetId === g.id).map(publicUser) });

  if (route === "POST /api/users") {
    const b = await readBody(req), users = readUsers();
    const err = checkNewUser(b, users) || (["admin", "usuario"].includes(b.role) ? null : "Perfil inválido.");
    if (err) return json(res, 400, { error: err });
    const u = newUser(b, b.role, g.id, me);
    users.push(u); writeUsers(users);
    return json(res, 201, { user: publicUser(u) });
  }

  const m = /^\/api\/users\/([\w-]+)(\/password)?$/.exec(url.pathname);
  if (!m) return json(res, 404, { error: "Não encontrado." });
  const users = readUsers(), target = users.find(u => u.id === m[1] && u.gabinetId === g.id);
  if (!target) return json(res, 404, { error: "Usuário não encontrado." });

  if (req.method === "DELETE" && !m[2]) {
    if (target.id === me.id) return json(res, 400, { error: "Você não pode remover a própria conta." });
    writeUsers(users.filter(u => u.id !== target.id));
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && m[2]) {
    const b = await readBody(req);
    if (String(b.password || "").length < PW_MIN) return json(res, 400, { error: `A senha precisa ter pelo menos ${PW_MIN} caracteres.` });
    target.password = hashPassword(String(b.password)); target.sv = (target.sv || 0) + 1; writeUsers(users);
    return json(res, 200, { ok: true });
  }
  if (req.method === "PATCH" && !m[2]) {
    const b = await readBody(req);
    if (target.id === me.id && b.role && b.role !== target.role) return json(res, 400, { error: "Você não pode mudar o próprio perfil." });
    if (b.role && ["admin", "usuario"].includes(b.role)) target.role = b.role;
    if (b.name && String(b.name).trim()) target.name = String(b.name).trim().slice(0, 80);
    writeUsers(users);
    return json(res, 200, { user: publicUser(target) });
  }
  return json(res, 404, { error: "Não encontrado." });
}

const SETUP_PAGE = msg => `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Configuração pendente</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px;color:#1c2a2e"><h1 style="font-size:22px">Falta uma configuração</h1><p>${msg}</p></body></html>`;

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/health") return send(res, 200, "ok");
    if (setupError) return send(res, 503, SETUP_PAGE(setupError), { "Content-Type": "text/html; charset=utf-8" });
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
    if (err instanceof HttpError) return json(res, err.status, { error: err.message });
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: "Erro no servidor." });
  }
}).listen(PORT, () => console.log(`Gerador de Indicações em http://localhost:${PORT} (dados em ${DATA_DIR})`));
