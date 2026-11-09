// Barra do usuário logado, troca de senha e gerenciamento de usuários (só administradores).
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const say = msg => (typeof window.toast === "function" ? window.toast(msg) : alert(msg));
  const ROLE = { admin: "Administrador", usuario: "Usuário" };
  let me = null;

  async function call(method, url, body) {
    const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && url !== "/api/me/password") { location.replace("/login"); throw new Error("Sessão expirada.") }
    if (!r.ok) throw new Error(d.error || "Algo deu errado. Tente de novo.");
    return d;
  }
  const initials = n => n.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";

  async function init() {
    try { me = (await call("GET", "/api/me")).user } catch { return }
    $("avatar").textContent = initials(me.name);
    $("whoName").textContent = me.name;
    $("whoRole").textContent = me.master ? "Administrador master" : ROLE[me.role];
    $("btnUsers").hidden = me.role !== "admin";
    $("userbar").hidden = false;
  }

  /* Fechar diálogos */
  document.querySelectorAll("dialog").forEach(d => {
    d.addEventListener("click", e => { if (e.target === d || e.target.hasAttribute("data-close")) d.close() });
  });

  $("btnLogout").onclick = async () => {
    try { await fetch("/api/logout", { method: "POST" }) } finally { location.replace("/login") }
  };

  /* Minha senha */
  $("btnPass").onclick = () => { $("formPass").reset(); $("cpErr").textContent = ""; $("dlgPass").showModal(); $("cpCur").focus() };
  $("formPass").onsubmit = async e => {
    e.preventDefault();
    const err = $("cpErr"); err.textContent = "";
    if ($("cpNew").value !== $("cpNew2").value) return (err.textContent = "As duas senhas novas não são iguais.");
    try {
      await call("POST", "/api/me/password", { current: $("cpCur").value, password: $("cpNew").value });
      $("dlgPass").close(); say("Senha alterada");
    } catch (x) { err.textContent = x.message }
  };

  /* Usuários */
  async function loadUsers() {
    const { users } = await call("GET", "/api/users");
    $("ulist").innerHTML = users.map(u => `
      <div class="urow" data-id="${esc(u.id)}">
        <span class="avatar">${esc(initials(u.name))}</span>
        <div class="info"><b>${esc(u.name)}${u.id === me.id ? " (você)" : ""}</b>
          <span>${esc(u.username)} · ${u.master ? "Administrador master" : ROLE[u.role]}</span></div>
        ${u.master ? "" : `<div class="acts">
          ${u.id === me.id ? "" : `<button type="button" class="small" data-act="role" data-role="${u.role === "admin" ? "usuario" : "admin"}">${u.role === "admin" ? "Tornar usuário" : "Tornar admin"}</button>`}
          <button type="button" class="small" data-act="pass">Nova senha</button>
          ${u.id === me.id ? "" : `<button type="button" class="small danger" data-act="del">Remover</button>`}
        </div>`}
      </div>`).join("");
  }
  $("btnUsers").onclick = async () => {
    $("formNew").reset(); $("nuErr").textContent = "";
    try { await loadUsers(); $("dlgUsers").showModal(); $("nuName").focus() } catch (x) { say(x.message) }
  };
  $("formNew").onsubmit = async e => {
    e.preventDefault();
    $("nuErr").textContent = "";
    try {
      const { user } = await call("POST", "/api/users", {
        name: $("nuName").value, username: $("nuUser").value, password: $("nuPass").value, role: $("nuRole").value });
      $("formNew").reset(); await loadUsers(); say(`${user.name} foi adicionado`); $("nuName").focus();
    } catch (x) { $("nuErr").textContent = x.message }
  };
  $("ulist").addEventListener("click", async e => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const row = b.closest(".urow"), id = row.dataset.id, name = row.querySelector("b").textContent;
    try {
      if (b.dataset.act === "del") {
        if (!confirm(`Remover ${name}? Essa pessoa não vai mais conseguir entrar.`)) return;
        await call("DELETE", "/api/users/" + id); say("Usuário removido");
      } else if (b.dataset.act === "pass") {
        const pw = prompt(`Nova senha para ${name} (mínimo de 8 caracteres):`);
        if (pw == null) return;
        await call("POST", `/api/users/${id}/password`, { password: pw }); say("Senha redefinida");
      } else if (b.dataset.act === "role") {
        await call("PATCH", "/api/users/" + id, { role: b.dataset.role }); say("Perfil alterado");
      }
      await loadUsers();
    } catch (x) { say(x.message) }
  });

  init();
})();
