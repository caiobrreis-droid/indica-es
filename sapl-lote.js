// Envio em lote para o SAPL (Sistema de Apoio ao Processo Legislativo).
// Roda dentro da página do SAPL, aberto pelo botão de favoritos do Gerador de Indicações.
// Usa o login que já está aberto no navegador: nenhuma senha passa pelo Gerador.
// Para cada PDF assinado: preenche e salva a proposição (como o botão "Salvar") e depois
// envia ao protocolo (como o botão "Enviar").
(() => {
  if (window.__saplLote) { window.__saplLote.show(); return }

  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const LOG_KEY = "saplLote.enviados";   // arquivos já enviados neste navegador, para não mandar duas vezes
  const base = location.origin;

  /* ---------- Painel (Shadow DOM para o CSS do SAPL não interferir) ---------- */
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
  <style>
    :host { all: initial }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif }
    .back { position: fixed; inset: 0; background: rgba(10,20,18,.55) }
    .box { position: fixed; inset: 24px; max-width: 1100px; margin: 0 auto; background: #fff; color: #1c2a2e;
      border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.35) }
    header { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid #d6dddb; background: #f3f5f4 }
    header h1 { font-size: 18px; margin: 0; flex: 1 }
    header small { color: #5d6b6e; font-size: 13px }
    .body { padding: 16px 18px; overflow: auto; flex: 1; display: grid; gap: 14px; align-content: start }
    .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center }
    label { font-size: 14px; display: flex; gap: 6px; align-items: center }
    select, textarea, input[type=text] { font: inherit; font-size: 14px; border: 1px solid #c9d2d0; border-radius: 6px; padding: 6px 8px; color: #1c2a2e; background: #fff }
    textarea { width: 100%; resize: vertical; min-height: 54px; font-size: 13px }
    button { font: 500 14px system-ui, sans-serif; border-radius: 6px; padding: 8px 14px; cursor: pointer; border: 1px solid #c9d2d0; background: #fff; color: #1c2a2e }
    button:hover { border-color: #1f6b4f }
    button.primary { background: #1f6b4f; border-color: #1f6b4f; color: #fff }
    button.danger { color: #b3261e }
    button[disabled] { opacity: .55; cursor: not-allowed }
    .drop { border: 2px dashed #9fb5ae; border-radius: 10px; padding: 22px; text-align: center; color: #5d6b6e; cursor: pointer }
    .drop.over { background: #e5efea; border-color: #1f6b4f }
    .note { font-size: 13px; color: #5d6b6e; margin: 0 }
    .warn { background: #fff4e5; color: #7a4a00; border-radius: 8px; padding: 10px 12px; font-size: 13px }
    .err { background: #fbeceb; color: #8c1d18; border-radius: 8px; padding: 10px 12px; font-size: 14px }
    table { width: 100%; border-collapse: collapse; font-size: 13px }
    th { text-align: left; font-weight: 600; color: #5d6b6e; padding: 6px; border-bottom: 1px solid #d6dddb }
    td { padding: 6px; border-bottom: 1px solid #edf1f0; vertical-align: top }
    td.n { width: 28px; color: #5d6b6e }
    td.f { width: 22%; word-break: break-word }
    td.s { width: 170px }
    .st { display: inline-block; padding: 2px 8px; border-radius: 99px; font-weight: 600; font-size: 12px; background: #edf1f0; color: #5d6b6e }
    .st.ok { background: #e5efea; color: #1f6b4f } .st.bad { background: #fbeceb; color: #b3261e } .st.run { background: #e8f0fb; color: #1d4f91 }
    .st + div { margin-top: 4px; color: #5d6b6e }
    a { color: #1d4f91 }
    footer { display: flex; gap: 10px; align-items: center; padding: 12px 18px; border-top: 1px solid #d6dddb; background: #f3f5f4 }
    footer .sum { flex: 1; font-size: 14px }
  </style>
  <div class="back"></div>
  <div class="box" role="dialog" aria-labelledby="t">
    <header><h1 id="t">Envio em lote para o SAPL</h1><small>Gerador de Indicações</small><button id="fechar">Fechar</button></header>
    <div class="body">
      <div id="msg"></div>
      <div class="row">
        <label>Tipo da proposição <select id="tipo"><option>Carregando…</option></select></label>
        <label><input type="checkbox" id="enviar" checked> Enviar ao protocolo depois de salvar</label>
      </div>
      <div class="drop" id="drop" tabindex="0" role="button">
        <b>Clique aqui ou arraste os PDFs assinados</b><br>
        <span class="note">A ementa de cada um é lida do próprio PDF. Confira e corrija antes de enviar.</span>
        <input type="file" id="arquivos" accept="application/pdf,.pdf" multiple hidden>
      </div>
      <table id="tabela" hidden>
        <thead><tr><th class="n">#</th><th>Arquivo</th><th>Ementa</th><th>Situação</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <footer>
      <span class="sum" id="sum">Nenhum arquivo escolhido.</span>
      <button id="parar" class="danger" hidden>Parar</button>
      <button id="limpar">Limpar lista</button>
      <button id="ir" class="primary" disabled>Salvar e enviar</button>
    </footer>
  </div>`;
  document.body.appendChild(host);
  const $ = id => root.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const show = () => { host.style.display = "" };
  window.__saplLote = { show };
  let rodando = false, parar = false, itens = [], formModelo = null;

  $("fechar").onclick = () => {
    if (rodando && !confirm("O envio está em andamento. Fechar mesmo assim? Os que faltam não serão enviados.")) return;
    parar = true; host.style.display = "none";
  };
  const msg = (html, cls = "warn") => { $("msg").innerHTML = html ? `<div class="${cls}">${html}</div>` : "" };

  /* ---------- Registro local do que já foi enviado ---------- */
  const lerLog = () => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || "{}") } catch { return {} } };
  const chave = f => f.name + "|" + f.size;
  function registrar(f, pk) { const l = lerLog(); l[chave(f)] = { pk, em: new Date().toISOString() }; try { localStorage.setItem(LOG_KEY, JSON.stringify(l)) } catch {} }

  /* ---------- Formulário do SAPL ---------- */
  async function carregarForm() {
    const r = await fetch(base + "/proposicao/create", { credentials: "same-origin" });
    const html = await r.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const form = [...doc.forms].find(f => f.querySelector('[name="descricao"]') && f.querySelector('[name="texto_original"]'));
    if (!form) {
      if (/login/i.test(r.url) || doc.querySelector('[name="password"]')) throw new Error("Entre no SAPL com o usuário do vereador e clique no botão de novo.");
      throw new Error("Não encontrei o formulário de nova proposição. Confira se este usuário pode criar proposições.");
    }
    return form;
  }
  async function iniciar() {
    try {
      formModelo = await carregarForm();
      const sel = formModelo.querySelector('[name="tipo"]');
      const ops = [...sel.options].filter(o => o.value);
      $("tipo").innerHTML = ops.map(o => `<option value="${esc(o.value)}">${esc(o.textContent.trim())}</option>`).join("");
      const ind = ops.find(o => /^indica[çc][aã]o$/i.test(o.textContent.trim())) || ops.find(o => /indica/i.test(o.textContent));
      if (ind) $("tipo").value = ind.value;
      msg("");
    } catch (e) { msg(esc(e.message), "err"); $("tipo").innerHTML = "<option>—</option>" }
  }

  /* ---------- Ementa lida do PDF ---------- */
  let pdfjsPronto = null;
  function carregarPdfjs() {
    pdfjsPronto ||= new Promise((ok, falha) => {
      if (window.pdfjsLib) return ok(window.pdfjsLib);
      const s = document.createElement("script"); s.src = PDFJS;
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; ok(window.pdfjsLib) };
      s.onerror = () => falha(new Error("Não consegui carregar o leitor de PDF."));
      document.head.appendChild(s);
    });
    return pdfjsPronto;
  }
  async function lerEmenta(file) {
    const pdfjs = await carregarPdfjs();
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let texto = "";
    for (let p = 1; p <= Math.min(doc.numPages, 2); p++) {
      const c = await (await doc.getPage(p)).getTextContent();
      texto += c.items.map(i => i.str + (i.hasEOL ? "\n" : "")).join(" ") + "\n";
    }
    const t = texto.replace(/[ \t ]+/g, " ");
    // o pedido começa em "QUE A PREFEITURA..." e vai até a JUSTIFICATIVA (entre os dois só tem a foto)
    const m = /(QUE\s+A\s+PREFEITURA[\s\S]*?)\s*JUSTIFICATIVA/i.exec(t) || /(QUE\s+A\s+PREFEITURA[^\n]*)/i.exec(t);
    if (!m) return "";
    return m[1].replace(/\s+/g, " ").replace(/^[‘’'"“”]+/, "")
      .replace(/\.(?=[A-ZÀ-Ý])/g, ". ")      // "AV.DOS" -> "AV. DOS" (o PDF às vezes junta as palavras)
      .replace(/\s+([,.;:])/g, "$1").trim();
  }

  /* ---------- Lista de arquivos ---------- */
  function resumo() {
    const n = itens.length, ok = itens.filter(i => i.estado === "enviada" || i.estado === "salva").length;
    const prontos = itens.filter(i => i.estado === "pronto").length;
    $("sum").textContent = n ? `${n} arquivo(s) · ${prontos} pronto(s) para enviar · ${ok} concluído(s)` : "Nenhum arquivo escolhido.";
    $("ir").disabled = rodando || !prontos || !formModelo;
    $("ir").textContent = $("enviar").checked ? `Salvar e enviar ${prontos || ""}`.trim() : `Só salvar ${prontos || ""}`.trim();
    $("tabela").hidden = !n;
  }
  $("enviar").onchange = resumo;
  function desenhar() {
    $("tabela").querySelector("tbody").innerHTML = itens.map((it, k) => `
      <tr data-k="${k}">
        <td class="n">${k + 1}</td>
        <td class="f">${esc(it.file.name)}</td>
        <td><textarea data-k="${k}" ${it.estado === "pronto" || it.estado === "sem ementa" ? "" : "readonly"}>${esc(it.ementa)}</textarea></td>
        <td class="s"><span class="st ${{ enviada: "ok", salva: "ok", erro: "bad", "já enviado": "bad", "sem ementa": "bad", salvando: "run", enviando: "run", lendo: "run" }[it.estado] || ""}">${esc(it.estado)}</span>
          ${it.info ? `<div>${it.info}</div>` : ""}</td>
      </tr>`).join("");
    resumo();
  }
  $("tabela").addEventListener("input", e => {
    const k = e.target.dataset.k; if (k == null) return;
    const it = itens[k]; it.ementa = e.target.value;
    if (it.estado === "sem ementa" && it.ementa.trim()) { it.estado = "pronto"; desenhar(); root.querySelector(`textarea[data-k="${k}"]`).focus() }
    resumo();
  });
  async function adicionar(files) {
    const log = lerLog();
    const novos = [...files].filter(f => /\.pdf$/i.test(f.name) || f.type === "application/pdf")
      .filter(f => !itens.some(i => chave(i.file) === chave(f)))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
    for (const f of novos) itens.push({ file: f, ementa: "", estado: "lendo", info: "" });
    desenhar();
    for (const it of itens.filter(i => i.estado === "lendo")) {
      try { it.ementa = await lerEmenta(it.file) } catch (e) { it.info = "Não consegui ler o PDF." }
      const ja = log[chave(it.file)];
      if (ja) { it.estado = "já enviado"; it.info = `Este arquivo já foi enviado daqui (<a href="${base}/proposicao/${ja.pk}" target="_blank">proposição ${ja.pk}</a>). Ele será pulado.` }
      else it.estado = it.ementa ? "pronto" : "sem ementa";
      if (it.estado === "sem ementa") it.info = "Não achei o texto \"QUE A PREFEITURA...\". Digite a ementa.";
      desenhar();
    }
  }
  $("drop").onclick = () => $("arquivos").click();
  $("drop").onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("arquivos").click() } };
  $("arquivos").onchange = e => { adicionar(e.target.files); e.target.value = "" };
  $("drop").ondragover = e => { e.preventDefault(); $("drop").classList.add("over") };
  $("drop").ondragleave = () => $("drop").classList.remove("over");
  $("drop").ondrop = e => { e.preventDefault(); $("drop").classList.remove("over"); adicionar(e.dataTransfer.files) };
  $("limpar").onclick = () => { if (!rodando) { itens = []; desenhar() } };
  $("parar").onclick = () => { parar = true; $("parar").disabled = true; $("parar").textContent = "Parando…" };

  /* ---------- Salvar e enviar ---------- */
  const textoAlertas = doc => [...doc.querySelectorAll(".alert, .errorlist, .has-error .help-block, .invalid-feedback")]
    .map(e => e.textContent.replace(/\s+/g, " ").replace(/^×\s*/, "").trim()).filter(Boolean);
  async function salvar(it) {
    const form = await carregarForm();               // formulário novo a cada vez (token e data atualizados)
    const fd = new FormData(form);
    fd.set("tipo", $("tipo").value);
    fd.set("descricao", it.ementa.trim());
    fd.set("texto_original", it.file, it.file.name);
    if (form.querySelector('[name="tipo_texto"]')) fd.set("tipo_texto", "D");
    const action = new URL(form.getAttribute("action") || "/proposicao/create", base).href;
    const r = await fetch(action, { method: "POST", body: fd, credentials: "same-origin" });
    const m = /\/proposicao\/(\d+)\/?(?:\?|$)/.exec(new URL(r.url).pathname + new URL(r.url).search);
    if (!r.ok || !m) {
      const doc = new DOMParser().parseFromString(await r.text(), "text/html");
      const erros = textoAlertas(doc);
      throw new Error(erros.length ? erros.join(" · ") : `O SAPL não confirmou o salvamento (resposta ${r.status}).`);
    }
    return m[1];
  }
  async function enviar(pk) {
    const r = await fetch(`${base}/proposicao/${pk}?action=send`, { credentials: "same-origin" });
    const doc = new DOMParser().parseFromString(await r.text(), "text/html");
    const alertas = textoAlertas(doc).join(" · ");
    if (/enviada com sucesso/i.test(alertas)) return alertas.match(/Indica[çc][aã]o: n[ºo°]\s*\d+/i)?.[0] || "";
    if (/já foi enviada/i.test(alertas)) return "";
    if (!r.ok || /não possui|não é possível|erro/i.test(alertas)) throw new Error(alertas || `O SAPL recusou o envio (resposta ${r.status}).`);
    return "o SAPL não mostrou a confirmação; confira no SAPL";
  }
  $("ir").onclick = async () => {
    const fila = itens.filter(i => i.estado === "pronto");
    if (!fila.length) return;
    const vazios = fila.filter(i => !i.ementa.trim());
    if (vazios.length) return msg("Há arquivos sem ementa. Preencha antes de continuar.");
    const comEnvio = $("enviar").checked;
    const tipoTxt = $("tipo").selectedOptions[0]?.textContent || "";
    if (!confirm(`${comEnvio ? "Salvar e ENVIAR AO PROTOCOLO" : "Salvar (sem enviar)"} ${fila.length} proposição(ões) do tipo "${tipoTxt}" no SAPL, com o usuário que está logado agora?\n\nConfira as ementas antes. Depois de enviadas, só o protocolo pode devolver.`)) return;
    rodando = true; parar = false; msg("");
    $("parar").hidden = false; $("parar").disabled = false; $("parar").textContent = "Parar"; $("limpar").disabled = true; resumo();
    for (const it of fila) {
      if (parar) break;
      try {
        it.estado = "salvando"; it.info = ""; desenhar();
        const pk = await salvar(it);
        it.pk = pk; it.info = `<a href="${base}/proposicao/${pk}" target="_blank">proposição ${pk}</a>`;
        if (comEnvio) {
          it.estado = "enviando"; desenhar();
          const num = await enviar(pk);
          it.estado = "enviada"; if (num) it.info += ` · ${esc(num)}`;
          registrar(it.file, pk);
        } else it.estado = "salva";
      } catch (e) {
        it.estado = "erro"; it.info = (it.info ? it.info + " · " : "") + esc(e.message);
      }
      desenhar();
      await new Promise(r => setTimeout(r, 400));   // não sobrecarregar o SAPL
    }
    rodando = false; $("parar").hidden = true; $("limpar").disabled = false;
    const erros = itens.filter(i => i.estado === "erro").length;
    msg(parar ? "Envio interrompido. Os que ficaram como \"pronto\" não foram enviados." :
      erros ? `${erros} arquivo(s) deram erro. Veja a coluna Situação; os demais foram concluídos.` :
      `Pronto! Todas as proposições foram ${comEnvio ? "salvas e enviadas" : "salvas (sem enviar)"}.`, erros || parar ? "warn" : "warn");
    desenhar();
  };

  iniciar();
  carregarPdfjs().catch(() => {});
})();
