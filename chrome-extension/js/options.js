"use strict";

const S = {
  texts:   [],
  ports:   [8081],
  opa:     { optimized: true, lines: 1 },
  jsonUrl: "",
  theme:   null,
  reorder: false,
  catFilter: "Todas",
};

const DEFAULT_THEME = { bg: "#1a1a2e", accent: "#e94560" };

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const st = await loadState();
  S.texts   = normalizeTexts(st.texts);
  S.ports   = Array.isArray(st.ports) ? st.ports : [8081];
  S.opa     = st.opa || { optimized: true, lines: 1 };
  S.jsonUrl = st.jsonUrl || "";
  S.theme   = st.theme;

  const theme = S.theme || DEFAULT_THEME;
  applyTheme(theme.bg, theme.accent);
  document.getElementById("bg-color").value     = theme.bg;
  document.getElementById("accent-color").value = theme.accent;

  document.getElementById("json-url-input").value = S.jsonUrl;
  document.getElementById("opa-toggle").checked   = S.opa.optimized;
  document.getElementById("opa-lines").value      = S.opa.lines;
  document.getElementById("opa-lines-val").textContent = S.opa.lines;
  syncOpaControls();

  renderTexts();
  renderPorts();
  bindEvents();
}

function bindEvents() {
  // Textos
  document.getElementById("btn-new-text").addEventListener("click", () => openDialog(-1));
  document.getElementById("btn-reorder").addEventListener("click", toggleReorder);
  document.getElementById("f-save").addEventListener("click", saveDialogText);
  document.getElementById("f-cancel").addEventListener("click", closeDialog);
  document.getElementById("f-delete").addEventListener("click", deleteDialogText);

  // Fonte de textos (URL)
  document.getElementById("btn-load-url").addEventListener("click", loadFromUrl);

  // Portas
  document.getElementById("btn-add-port").addEventListener("click", addPort);
  document.getElementById("new-port-input").addEventListener("keypress", e => {
    if (e.key === "Enter") addPort();
  });

  // OPA
  document.getElementById("opa-toggle").addEventListener("change", saveOpa);
  document.getElementById("opa-lines").addEventListener("input", saveOpa);

  // Aparência
  document.getElementById("bg-color").addEventListener("input", previewTheme);
  document.getElementById("accent-color").addEventListener("input", previewTheme);
  document.getElementById("btn-save-theme").addEventListener("click", saveTheme);
  document.getElementById("btn-reset-theme").addEventListener("click", resetTheme);

  // Backup
  document.getElementById("btn-export-full").addEventListener("click", exportFullBackup);
  document.getElementById("btn-import-full").addEventListener("click", () => document.getElementById("file-full").click());
  document.getElementById("file-full").addEventListener("change", importFullBackup);
  document.getElementById("btn-export-texts").addEventListener("click", exportTexts);
  document.getElementById("btn-import-texts").addEventListener("click", () => document.getElementById("file-texts").click());
  document.getElementById("file-texts").addEventListener("change", importTexts);
  document.getElementById("btn-clear-data").addEventListener("click", clearAllData);
}

/* ─── Textos (CRUD) ──────────────────────────────────────────────────────── */
function renderTexts() {
  renderCatFilter();

  const list = document.getElementById("texts-list");
  list.innerHTML = "";
  list.classList.toggle("reorder", S.reorder);

  // Índices globais dos textos visíveis no filtro atual
  const view = [];
  S.texts.forEach((t, i) => {
    if (S.catFilter === "Todas" || (t.category || "Geral") === S.catFilter) view.push(i);
  });

  if (!view.length) {
    list.innerHTML = `<p class="hint">Nenhum texto ${S.texts.length ? "nesta categoria" : 'cadastrado. Clique em "Novo texto" ou importe um backup'}.</p>`;
    return;
  }

  view.forEach(gIdx => {
    const item = S.texts[gIdx];
    const card = document.createElement("div");
    card.className = "text-card-opt";
    card.title = S.reorder ? "Arraste para reordenar" : "Clique para editar";
    card.innerHTML = `
      <div class="head">
        <span class="label">${escapeHtml(item.label)}</span>
        ${S.catFilter === "Todas" ? `<span class="badge">${escapeHtml(item.category || "Geral")}</span>` : ""}
      </div>
      <div class="preview">${escapeHtml(item.text)}</div>`;

    if (S.reorder) attachDragEvents(card, gIdx);
    else card.addEventListener("click", () => openDialog(gIdx));

    list.appendChild(card);
  });
}

function renderCatFilter() {
  const wrap = document.getElementById("cat-filter");
  wrap.innerHTML = "";

  const cats = getCategories(S.texts);
  wrap.style.display = cats.length > 1 ? "flex" : "none";
  if (cats.length <= 1) { S.catFilter = "Todas"; return; }
  if (S.catFilter !== "Todas" && !cats.includes(S.catFilter)) S.catFilter = "Todas";

  ["Todas", ...cats].forEach(cat => {
    const chip = document.createElement("button");
    chip.className = `chip ${S.catFilter === cat ? "active" : ""}`;
    chip.textContent = cat;
    chip.addEventListener("click", () => {
      S.catFilter = cat;
      renderTexts();
    });
    wrap.appendChild(chip);
  });
}

/* ─── Reorganizar (drag & drop) ──────────────────────────────────────────── */
let dragIdx = null; // índice global do texto sendo arrastado

function toggleReorder() {
  S.reorder = !S.reorder;
  document.getElementById("btn-reorder").classList.toggle("active", S.reorder);
  renderTexts();
  showToast(S.reorder ? "Arraste os textos para mudar a ordem." : "Reorganização concluída.");
}

function attachDragEvents(card, gIdx) {
  card.draggable = true;

  card.addEventListener("dragstart", e => {
    dragIdx = gIdx;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  card.addEventListener("dragend", () => {
    dragIdx = null;
    card.classList.remove("dragging");
    document.querySelectorAll(".text-card-opt").forEach(c => c.classList.remove("drag-over"));
  });

  card.addEventListener("dragover", e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIdx !== null && dragIdx !== gIdx) card.classList.add("drag-over");
  });

  card.addEventListener("dragleave", () => card.classList.remove("drag-over"));

  card.addEventListener("drop", async e => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === gIdx) return;
    const [moved] = S.texts.splice(dragIdx, 1);
    S.texts.splice(gIdx, 0, moved);
    dragIdx = null;
    await saveTexts();
    renderTexts();
    showToast("Ordem atualizada!");
  });
}

function saveTexts() {
  return saveState({ texts: S.texts });
}

function openDialog(index) {
  const dialog = document.getElementById("text-dialog");
  dialog.dataset.index = index;

  // Datalist de categorias existentes
  const datalist = document.getElementById("cat-datalist");
  datalist.innerHTML = "";
  getCategories(S.texts).forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    datalist.appendChild(opt);
  });

  if (index === -1) {
    document.getElementById("dialog-title").textContent = "Novo texto";
    document.getElementById("f-label").value    = "";
    document.getElementById("f-text").value     = "";
    document.getElementById("f-category").value = "Geral";
    document.getElementById("f-delete").style.display = "none";
  } else {
    const item = S.texts[index];
    document.getElementById("dialog-title").textContent = "Editar texto";
    document.getElementById("f-label").value    = item.label;
    document.getElementById("f-text").value     = item.text;
    document.getElementById("f-category").value = item.category || "Geral";
    document.getElementById("f-delete").style.display = "inline-flex";
  }

  dialog.showModal();
}

function closeDialog() {
  document.getElementById("text-dialog").close();
}

async function saveDialogText() {
  const index    = parseInt(document.getElementById("text-dialog").dataset.index);
  const label    = document.getElementById("f-label").value.trim();
  const text     = document.getElementById("f-text").value.trim();
  const category = document.getElementById("f-category").value.trim() || "Geral";

  if (!label || !text) { showToast("Preencha rótulo e texto!", true); return; }

  const item = { text, label, category };
  if (index === -1) S.texts.push(item);
  else S.texts[index] = item;

  await saveTexts();
  renderTexts();
  closeDialog();
  showToast(index === -1 ? "Texto criado!" : "Texto atualizado!");
}

async function deleteDialogText() {
  const index = parseInt(document.getElementById("text-dialog").dataset.index);
  if (index < 0 || isNaN(index)) return;
  if (!confirm("Tem certeza que deseja excluir este texto?")) return;

  S.texts.splice(index, 1);
  await saveTexts();
  renderTexts();
  closeDialog();
  showToast("Texto removido.");
}

/* ─── Fonte de textos (URL) ──────────────────────────────────────────────── */
async function loadFromUrl() {
  const url = document.getElementById("json-url-input").value.trim();
  if (!url) { showToast("Informe uma URL válida.", true); return; }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    S.texts = normalizeTexts(await res.json());
    await saveState({ texts: S.texts, jsonUrl: url });
    renderTexts();
    showToast("Textos carregados da URL!");
  } catch (err) {
    showToast("Erro ao carregar URL: " + err.message, true);
  }
}

/* ─── Portas ─────────────────────────────────────────────────────────────── */
function renderPorts() {
  const list = document.getElementById("ports-list");
  list.innerHTML = "";

  S.ports.forEach(port => {
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = port;

    const x = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    x.setAttribute("class", "icon");
    x.setAttribute("viewBox", "0 0 24 24");
    x.innerHTML = `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`;
    x.addEventListener("click", () => removePort(port));
    tag.appendChild(x);

    list.appendChild(tag);
  });
}

async function addPort() {
  const input = document.getElementById("new-port-input");
  const port  = parseInt(input.value, 10);
  if (!port || port < 1 || port > 65535) { showToast("Porta inválida (1–65535).", true); return; }
  if (S.ports.includes(port))            { showToast("Porta já adicionada.", true); return; }

  S.ports.push(port);
  await saveState({ ports: S.ports });
  renderPorts();
  input.value = "";
  input.focus();
}

async function removePort(port) {
  S.ports = S.ports.filter(p => p !== port);
  await saveState({ ports: S.ports });
  renderPorts();
}

/* ─── OPA ────────────────────────────────────────────────────────────────── */
async function saveOpa() {
  S.opa = {
    optimized: document.getElementById("opa-toggle").checked,
    lines:     parseInt(document.getElementById("opa-lines").value),
  };
  document.getElementById("opa-lines-val").textContent = S.opa.lines;
  syncOpaControls();
  await saveState({ opa: S.opa });
}

function syncOpaControls() {
  const ctrl = document.getElementById("opa-extra-controls");
  ctrl.style.opacity       = S.opa.optimized ? "1" : "0.45";
  ctrl.style.pointerEvents = S.opa.optimized ? "all" : "none";
}

/* ─── Aparência ──────────────────────────────────────────────────────────── */
function previewTheme() {
  applyTheme(document.getElementById("bg-color").value, document.getElementById("accent-color").value);
}

async function saveTheme() {
  S.theme = {
    bg:     document.getElementById("bg-color").value,
    accent: document.getElementById("accent-color").value,
  };
  applyTheme(S.theme.bg, S.theme.accent);
  await saveState({ theme: S.theme });
  showToast("Tema salvo!");
}

async function resetTheme() {
  S.theme = null;
  await saveState({ theme: null });
  applyTheme(DEFAULT_THEME.bg, DEFAULT_THEME.accent);
  document.getElementById("bg-color").value     = DEFAULT_THEME.bg;
  document.getElementById("accent-color").value = DEFAULT_THEME.accent;
  showToast("Tema restaurado!");
}

/* ─── Backup ─────────────────────────────────────────────────────────────── */
// Mesmo formato do exportFullConfig() do app web — backups são intercambiáveis.
function exportFullBackup() {
  const backup = {
    version:   1,
    timestamp: new Date().toISOString(),
    settings: {
      theme:     S.theme,
      jsonUrl:   S.jsonUrl || document.getElementById("json-url-input").value.trim() || null,
      ports:     S.ports,
      compact:   false,
      opaConfig: { optimized: S.opa.optimized, lines: S.opa.lines },
    },
    data: {
      texts:   S.texts,
      notepad: "",
    },
  };
  downloadJson(backup, "suporteapp_backup_completo.json");
}

function importFullBackup(e) {
  readJsonFile(e.target.files[0], async backup => {
    if (!backup.settings || !backup.data) throw new Error("Arquivo de backup inválido");

    const updates = {};
    if (backup.settings.theme)     updates.theme   = backup.settings.theme;
    if (backup.settings.jsonUrl)   updates.jsonUrl = backup.settings.jsonUrl;
    if (backup.settings.ports)     updates.ports   = backup.settings.ports;
    if (backup.settings.opaConfig) updates.opa     = backup.settings.opaConfig;
    if (backup.data.texts)         updates.texts   = normalizeTexts(backup.data.texts);

    await saveState(updates);
    showToast("Backup restaurado! Recarregando...");
    setTimeout(() => location.reload(), 1200);
  });
  e.target.value = "";
}

function exportTexts() {
  if (!S.texts.length) { showToast("Nada para exportar.", true); return; }
  downloadJson(S.texts, "meus_textos.json");
}

function importTexts(e) {
  readJsonFile(e.target.files[0], async data => {
    if (!Array.isArray(data)) throw new Error("Formato inválido (deve ser lista)");
    await saveState({ texts: normalizeTexts(data) });
    showToast("Importado com sucesso! Recarregando...");
    setTimeout(() => location.reload(), 1000);
  });
  e.target.value = "";
}

async function clearAllData() {
  if (!confirm("Isso apagará permanentemente todos os seus textos, portas e configurações da extensão. Continuar?")) return;
  await chrome.storage.local.clear();
  location.reload();
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function downloadJson(data, filename) {
  const a = document.createElement("a");
  a.href     = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function readJsonFile(file, onSuccess) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try { await onSuccess(JSON.parse(e.target.result)); }
    catch (err) { showToast("Erro: " + err.message, true); }
  };
  reader.readAsText(file);
}
