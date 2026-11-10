// Login, gabinetes, configurações do gabinete e usuários.
// Carrega o gabinete do usuário (ou o escolhido pelo master) e só então inicia o gerador.
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function say(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2600);
  }
  const ROLE = { master: "Administrador master", admin: "Administrador do gabinete", usuario: "Assessor" };
  const SEL_KEY = "gab.selecionado";
  let me = null, gabId = null, dirty = false;

  async function call(method, url, body) {
    const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && url !== "/api/me/password") { location.replace("/login"); throw new Error("Sessão expirada.") }
    if (!r.ok) throw new Error(d.error || "Algo deu errado. Tente de novo.");
    return d;
  }
  // O master diz em qual gabinete está mexendo; os outros usuários só têm o próprio.
  const q = url => (me && me.master && gabId ? url + (url.includes("?") ? "&" : "?") + "g=" + encodeURIComponent(gabId) : url);
  const initials = n => n.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";
  const getSel = () => { try { return localStorage.getItem(SEL_KEY) } catch { return null } };
  const setSel = v => { try { localStorage.setItem(SEL_KEY, v) } catch {} };

  async function assetDataUrl(kind) {
    const r = await fetch(q("/api/gabinete/asset/" + kind));
    if (!r.ok) return null;
    const blob = await r.blob();
    return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(blob) });
  }

  function emptyState(msg) {
    document.querySelector("main").innerHTML = `<section class="panel" style="grid-column:1/-1"><div class="empty">${msg}</div></section>`;
  }

  async function init() {
    let info; try { info = await call("GET", "/api/me"); me = info.user } catch { return }
    if (info.storage && !info.storage.persistent) $("storageWarn").hidden = false;
    $("avatar").textContent = initials(me.name);
    $("whoName").textContent = me.name;
    $("whoRole").textContent = ROLE[me.role] || ROLE.usuario;
    const manage = me.master || me.role === "admin";
    $("btnGabs").hidden = !me.master;
    $("btnUsers").hidden = $("btnConfig").hidden = !manage;
    $("userbar").hidden = false;

    if (me.master) {
      const { gabinetes } = await call("GET", "/api/gabinetes");
      if (!gabinetes.length) {
        $("btnUsers").hidden = $("btnConfig").hidden = true;
        emptyState("Nenhum gabinete cadastrado ainda. Clique em <b>Gabinetes</b> para criar o primeiro.");
        return openGabs();
      }
      gabId = gabinetes.some(g => g.id === getSel()) ? getSel() : gabinetes[0].id;
      $("gabPick").innerHTML = gabinetes.map(g => `<option value="${esc(g.id)}">${esc(g.nome)}${g.ativo ? "" : " (bloqueado)"}</option>`).join("");
      $("gabPick").value = gabId;
      $("gabPickWrap").hidden = gabinetes.length < 2;
    }
    await startGab();
  }

  async function startGab() {
    try {
      const { gabinete } = await call("GET", q("/api/gabinete"));
      const [timbrado, selo] = await Promise.all([gabinete.timbrado ? assetDataUrl("timbrado") : null, gabinete.selo ? assetDataUrl("selo") : null]);
      window.startApp({ id: gabinete.id, nome: gabinete.nome, config: gabinete.config, assets: { timbrado, selo },
        services: gabinete.services, servicesSaved: gabinete.servicesSaved,
        canManage: me.master || me.role === "admin",
        api: (method, url, body) => call(method, q(url), body) });
      if (!gabinete.timbrado && (me.master || me.role === "admin")) say("Este gabinete ainda não tem papel timbrado. Envie em Configurações.");
    } catch (x) { emptyState(esc(x.message)) }
  }

  $("gabPick").onchange = () => { setSel($("gabPick").value); location.reload() };

  /* Fechar diálogos (e recarregar se algo que muda as indicações foi alterado) */
  document.querySelectorAll("dialog").forEach(d => {
    const shut = () => { d.close(); if (dirty) location.reload() };
    d.addEventListener("click", e => { if (e.target === d || e.target.hasAttribute("data-close")) shut() });
    d.addEventListener("cancel", e => { e.preventDefault(); shut() });   // tecla Esc
  });

  $("btnLogout").onclick = async () => {
    try { await fetch("/api/logout", { method: "POST" }) } finally { location.replace("/login") }
  };

  /* ---------- Minha senha ---------- */
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

  /* ---------- Gabinetes (master) ---------- */
  async function loadGabs() {
    const { gabinetes } = await call("GET", "/api/gabinetes");
    $("glist").innerHTML = gabinetes.length ? gabinetes.map(g => `
      <div class="urow" data-id="${esc(g.id)}" data-nome="${esc(g.nome)}">
        <div class="info"><b>${esc(g.nome)}</b>
          <span>${g.usuarios} ${g.usuarios === 1 ? "usuário" : "usuários"} · admin: ${esc(g.admins.join(", ") || "nenhum")}${g.timbrado ? "" : " · sem timbrado"}</span></div>
        <span class="badge ${g.ativo ? "" : "off"}">${g.ativo ? "Ativo" : "Bloqueado"}</span>
        <div class="acts">
          <button type="button" class="small" data-act="open">Abrir</button>
          <button type="button" class="small" data-act="toggle" data-ativo="${!g.ativo}">${g.ativo ? "Bloquear" : "Desbloquear"}</button>
          <button type="button" class="small danger" data-act="del">Excluir</button>
        </div>
      </div>`).join("") : `<div class="empty">Nenhum gabinete ainda.</div>`;
  }
  async function openGabs() {
    $("formGab").reset(); $("ngErr").textContent = "";
    try { await loadGabs(); $("dlgGabs").showModal(); $("ngNome").focus() } catch (x) { say(x.message) }
  }
  $("btnGabs").onclick = openGabs;
  $("formGab").onsubmit = async e => {
    e.preventDefault();
    $("ngErr").textContent = "";
    try {
      const { gabinete } = await call("POST", "/api/gabinetes", {
        nome: $("ngNome").value, name: $("ngName").value, username: $("ngUser").value, password: $("ngPass").value });
      $("formGab").reset(); await loadGabs(); say(`${gabinete.nome} foi criado`);
      if (!gabId) setSel(gabinete.id);
      dirty = true;
    } catch (x) { $("ngErr").textContent = x.message }
  };
  $("glist").addEventListener("click", async e => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const row = b.closest(".urow"), id = row.dataset.id, nome = row.dataset.nome;
    try {
      if (b.dataset.act === "open") { setSel(id); location.reload(); return }
      if (b.dataset.act === "toggle") {
        const ativo = b.dataset.ativo === "true";
        if (!ativo && !confirm(`Bloquear ${nome}? Ninguém desse gabinete vai conseguir entrar até você desbloquear.`)) return;
        await call("PATCH", "/api/gabinetes/" + id, { ativo }); say(ativo ? "Gabinete desbloqueado" : "Gabinete bloqueado");
      }
      if (b.dataset.act === "del") {
        const typed = prompt(`Excluir ${nome} apaga o gabinete, o timbrado e todos os usuários dele. Não dá para desfazer.\n\nPara confirmar, digite EXCLUIR:`);
        if (typed == null) return;
        if (typed.trim().toUpperCase() !== "EXCLUIR") return say("Exclusão cancelada");
        await call("DELETE", "/api/gabinetes/" + id); say("Gabinete excluído");
        if (id === gabId) setSel("");
      }
      dirty = true; await loadGabs();
    } catch (x) { say(x.message) }
  });

  /* ---------- Configurações do gabinete ---------- */
  const CF = { vereador: "cfVereador", prefeito: "cfPrefeito", presidente: "cfPresidente", municipio: "cfMunicipio", uf: "cfUf", artigo: "cfArtigo", justif: "cfJustif", seloPos: "cfSeloPos" };
  function thumb(kind, has) {
    const el = $(kind === "timbrado" ? "thTimbrado" : "thSelo");
    const src = q("/api/gabinete/asset/" + kind);
    el.innerHTML = has ? `<img alt="" src="${esc(src + (src.includes("?") ? "&" : "?") + "t=" + Date.now())}">` : "Nenhuma imagem enviada";
    document.querySelector(`[data-rmasset="${kind}"]`).hidden = !has;
  }
  $("btnConfig").onclick = async () => {
    try {
      const { gabinete } = await call("GET", q("/api/gabinete"));
      $("dlgConfigT").textContent = "Configurações: " + gabinete.nome;
      for (const [k, id] of Object.entries(CF)) $(id).value = gabinete.config[k] || "";
      $("cfErr").textContent = "";
      thumb("timbrado", gabinete.timbrado); thumb("selo", gabinete.selo);
      $("dlgConfig").showModal();
    } catch (x) { say(x.message) }
  };
  $("formCfg").onsubmit = async e => {
    e.preventDefault();
    $("cfErr").textContent = "";
    const config = {}; for (const [k, id] of Object.entries(CF)) config[k] = $(id).value;
    try { await call("PUT", q("/api/gabinete"), { config }); dirty = true; say("Configurações salvas") }
    catch (x) { $("cfErr").textContent = x.message }
  };
  document.querySelectorAll("[data-up]").forEach(b => b.onclick = () => $(b.dataset.up === "timbrado" ? "upTimbrado" : "upSelo").click());
  // Converte a imagem para PNG num tamanho bom para impressão antes de enviar.
  function toPng(file, maxW) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, maxW / img.naturalWidth);
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve({ dataUrl: c.toDataURL("image/png"), ratio: img.naturalHeight / img.naturalWidth });
      };
      img.onerror = () => reject(new Error("Não consegui abrir essa imagem. Use PNG ou JPG."));
      img.src = URL.createObjectURL(file);
    });
  }
  ["upTimbrado", "upSelo"].forEach(id => $(id).addEventListener("change", async e => {
    const file = e.target.files[0], kind = e.target.dataset.kind; e.target.value = "";
    if (!file) return;
    try {
      const { dataUrl, ratio } = await toPng(file, kind === "timbrado" ? 1240 : 1000);
      if (kind === "timbrado" && Math.abs(ratio - 1.414) > 0.08 &&
        !confirm("Essa imagem não tem o formato de uma folha A4 em pé. Ela vai ser esticada para ocupar a folha toda. Enviar mesmo assim?")) return;
      say("Enviando…");
      const { gabinete } = await call("PUT", q("/api/gabinete/asset/" + kind), { dataUrl });
      thumb(kind, gabinete[kind]); dirty = true; say(kind === "timbrado" ? "Timbrado atualizado" : "Selo atualizado");
    } catch (x) { say(x.message) }
  }));
  document.querySelectorAll("[data-rmasset]").forEach(b => b.onclick = async () => {
    const kind = b.dataset.rmasset;
    if (!confirm(kind === "timbrado" ? "Remover o papel timbrado? As indicações vão sair em folha branca." : "Remover o selo da foto?")) return;
    try { const { gabinete } = await call("DELETE", q("/api/gabinete/asset/" + kind)); thumb(kind, gabinete[kind]); dirty = true }
    catch (x) { say(x.message) }
  });

  /* ---------- Usuários do gabinete ---------- */
  async function loadUsers() {
    const { users } = await call("GET", q("/api/users"));
    $("ulist").innerHTML = users.length ? users.map(u => `
      <div class="urow" data-id="${esc(u.id)}">
        <span class="avatar">${esc(initials(u.name))}</span>
        <div class="info"><b>${esc(u.name)}${u.id === me.id ? " (você)" : ""}</b>
          <span>${esc(u.username)} · ${ROLE[u.role]}</span></div>
        <div class="acts">
          ${u.id === me.id ? "" : `<button type="button" class="small" data-act="role" data-role="${u.role === "admin" ? "usuario" : "admin"}">${u.role === "admin" ? "Tornar assessor" : "Tornar admin"}</button>`}
          <button type="button" class="small" data-act="pass">Nova senha</button>
          ${u.id === me.id ? "" : `<button type="button" class="small danger" data-act="del">Remover</button>`}
        </div>
      </div>`).join("") : `<div class="empty">Nenhum usuário neste gabinete.</div>`;
  }
  $("btnUsers").onclick = async () => {
    $("formNew").reset(); $("nuErr").textContent = "";
    const nome = me.master ? $("gabPick").selectedOptions[0]?.textContent : $("gabNome").textContent;
    $("dlgUsersT").textContent = nome ? "Usuários: " + nome : "Usuários";
    try { await loadUsers(); $("dlgUsers").showModal(); $("nuName").focus() } catch (x) { say(x.message) }
  };
  $("formNew").onsubmit = async e => {
    e.preventDefault();
    $("nuErr").textContent = "";
    try {
      const { user } = await call("POST", q("/api/users"), {
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
        await call("DELETE", q("/api/users/" + id)); say("Usuário removido");
      } else if (b.dataset.act === "pass") {
        const pw = prompt(`Nova senha para ${name} (mínimo de 8 caracteres):`);
        if (pw == null) return;
        await call("POST", q(`/api/users/${id}/password`), { password: pw }); say("Senha redefinida");
      } else if (b.dataset.act === "role") {
        await call("PATCH", q("/api/users/" + id), { role: b.dataset.role }); say("Perfil alterado");
      }
      await loadUsers();
    } catch (x) { say(x.message) }
  });

  init();
})();
