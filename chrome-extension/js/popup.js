"use strict";

const S = {
  texts:    [],
  ports:    [8081],
  opa:      { optimized: true, lines: 1 },
  category: "Todas",
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const st = await loadState();
  S.texts    = normalizeTexts(st.texts);
  S.ports    = Array.isArray(st.ports) ? st.ports : [8081];
  S.opa      = st.opa || { optimized: true, lines: 1 };
  S.category = st.lastCategory || "Todas";

  if (st.theme) applyTheme(st.theme.bg, st.theme.accent);

  renderTabs();
  renderGrid();
  bindEvents();
}

/* ─── Eventos ────────────────────────────────────────────────────────────── */
let ipInputTimer = null;

function bindEvents() {
  const ipInput = document.getElementById("ip-input");

  ipInput.addEventListener("paste", e => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (!text) return;
    e.preventDefault();
    ipInput.value = text.trim();
    openIpFromInput();
  });

  ipInput.addEventListener("keypress", e => {
    if (e.key === "Enter") openIpFromInput();
  });

  ipInput.addEventListener("input", () => {
    clearTimeout(ipInputTimer);
    ipInputTimer = setTimeout(() => {
      if (ipInput.value && IP_RE.test(ipInput.value)) openIpFromInput();
    }, 150);
  });

  document.getElementById("btn-paste-ip").addEventListener("click", pasteAndOpen);
  document.getElementById("btn-options").addEventListener("click", () => chrome.runtime.openOptionsPage());

  // Ctrl+V em qualquer lugar do popup abre o IP da área de transferência
  document.addEventListener("paste", e => {
    if (e.target === ipInput) return; // o campo já tem o próprio handler
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (!text || !IP_RE.test(text)) return;
    e.preventDefault();
    ipInput.value = text.trim();
    openIpFromInput();
  });

  // Busca fantasma: digitar em qualquer lugar filtra os botões
  document.addEventListener("keydown", handleSearchKeydown);

  // Código Konami abre o Cosmic Snake
  document.addEventListener("keydown", handleKonami);
  document.getElementById("btn-close-game").addEventListener("click", closeSnake);
}

/* ─── Easter Egg: Cosmic Snake ───────────────────────────────────────────── */
const SNAKE_URL = "https://dreamerjp.github.io/SuporteApp-Web/snake.html";
const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
let konamiPos = 0;

function handleKonami(e) {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") { konamiPos = 0; return; }
  if (e.key === KONAMI[konamiPos]) {
    if (++konamiPos === KONAMI.length) { openSnake(); konamiPos = 0; }
  } else {
    konamiPos = 0;
  }
}

function openSnake() {
  clearSearch();
  const frame = document.getElementById("game-frame");
  frame.src = SNAKE_URL;
  frame.addEventListener("load", () => frame.focus(), { once: true });
  document.body.classList.add("game-mode");
}

function closeSnake() {
  document.body.classList.remove("game-mode");
  document.getElementById("game-frame").src = "";
}

/* ─── IP Opener ──────────────────────────────────────────────────────────── */
async function pasteAndOpen() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !IP_RE.test(text)) {
      showToast("Nenhum IP na área de transferência.", true);
      return;
    }
    document.getElementById("ip-input").value = text.trim();
    openIpFromInput();
  } catch {
    showToast("Não foi possível ler a área de transferência.", true);
  }
}

async function openIpFromInput() {
  const input = document.getElementById("ip-input");
  if (!input.value) return;

  const opened = await openIpTabs(input.value, S.ports);
  if (opened > 0) {
    const ip = input.value.match(IP_RE)[1];
    showToast(`${opened} abas abertas para ${ip}`);
    input.value = "";
  } else {
    showToast("Nenhum IP válido encontrado.", true);
  }
}

/* ─── Renderização ───────────────────────────────────────────────────────── */
function renderTabs() {
  const nav = document.getElementById("category-tabs");
  nav.innerHTML = "";

  const cats = ["Todas", ...getCategories(S.texts)];
  cats.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = `cat-tab ${S.category === cat ? "active" : ""}`;
    btn.textContent = cat;
    btn.addEventListener("click", () => {
      S.category = cat;
      saveState({ lastCategory: cat });
      renderTabs();
      renderGrid();
    });
    nav.appendChild(btn);
  });
}

function renderGrid() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  const items = S.texts.filter(t => S.category === "Todas" || t.category === S.category);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `Nenhum texto ${S.texts.length ? "nesta categoria" : "cadastrado"}.<small>Adicione ou importe seus textos nas configurações.</small>`;
    const btn = document.createElement("button");
    btn.className = "accent";
    btn.textContent = "Abrir configurações";
    btn.addEventListener("click", () => chrome.runtime.openOptionsPage());
    empty.appendChild(btn);
    grid.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "text-card";
    card.title = item.text;
    card.dataset.index = S.texts.indexOf(item);
    card.innerHTML = `<span>${escapeHtml(item.label)}</span>`;
    card.addEventListener("click", () => copyText(item.text));
    grid.appendChild(card);
  });
}

/* ─── Cópia ──────────────────────────────────────────────────────────────── */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(formatForCopy(text, S.opa));
    showToast(S.opa.optimized ? "Copiado com Otimização!" : "Copiado!");
  } catch {
    showToast("Erro ao copiar :(", true);
  }
}

/* ─── Busca fantasma (igual ao app web) ──────────────────────────────────── */
const SEARCH_IDLE = 5000;
const Search = { query: "", selected: false, timeout: null };

function normalizeText(text) {
  return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function levenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = [];
  for (let i = 0; i <= b.length; i++) {
    m[i] = [i];
    for (let j = 1; j <= a.length; j++)
      m[i][j] = i === 0 ? j : 0;
  }
  for (let i = 1; i <= b.length; i++)
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
    }
  return m[b.length][a.length];
}

function fuzzyMatch(item, rawQuery) {
  const query      = normalizeText(rawQuery);
  const queryWords = query.split(/\s+/).filter(w => w.length > 0);
  if (!queryWords.length) return false;

  const full      = normalizeText(item.label) + " " + normalizeText(item.text);
  const fullWords = full.split(/\s+/).filter(w => w.length > 0);

  if (full.includes(query)) return true;

  let matched = 0;
  for (const qw of queryWords) {
    if (full.includes(qw)) { matched++; continue; }
    if (qw.length >= 3) {
      const threshold = qw.length > 5 ? 2 : 1;
      if (fullWords.some(tw => tw.length >= 3 && levenshtein(qw, tw) <= threshold)) {
        matched++;
      }
    }
  }
  return matched >= queryWords.length * 0.75;
}

function handleSearchKeydown(e) {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  // Enter ou Ctrl+A — copia o primeiro botão destacado
  if ((e.key === "Enter" || (e.ctrlKey && e.key.toLowerCase() === "a")) && Search.query.length) {
    e.preventDefault();
    const match = document.querySelector(".text-card.search-match");
    if (match) {
      document.getElementById("search-query").classList.add("selected");
      Search.selected = true;
      const idx = parseInt(match.dataset.index);
      if (!isNaN(idx)) copyText(S.texts[idx]?.text || "");
    }
    return;
  }

  if (e.key === "Backspace" && Search.query.length) {
    Search.query = Search.query.slice(0, -1);
    if (!Search.query) { clearSearch(); return; }
    updateSearchUI();
    return;
  }

  if (e.key === "Escape" && Search.query.length) { clearSearch(); return; }

  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    if (Search.selected) clearSearch();
    Search.query += e.key;
    updateSearchUI();
  }
}

function updateSearchUI() {
  const queryEl  = document.getElementById("search-query");
  const timerBar = document.getElementById("search-timer-bar");

  queryEl.textContent = Search.query;
  queryEl.classList.remove("selected");
  Search.selected = false;
  document.getElementById("search-overlay").classList.add("active");

  document.querySelectorAll(".text-card").forEach(card => {
    const idx  = parseInt(card.dataset.index);
    const item = S.texts[idx];
    card.classList.toggle("search-match", !!(item && fuzzyMatch(item, Search.query)));
  });

  document.querySelector(".text-card.search-match")?.scrollIntoView({ block: "nearest" });

  timerBar.style.transition = "none";
  timerBar.style.width = "0%";
  requestAnimationFrame(() => {
    timerBar.style.transition = `width ${SEARCH_IDLE}ms linear`;
    timerBar.style.width = "100%";
  });

  clearTimeout(Search.timeout);
  Search.timeout = setTimeout(clearSearch, SEARCH_IDLE);
}

function clearSearch() {
  Search.query    = "";
  Search.selected = false;
  clearTimeout(Search.timeout);
  document.getElementById("search-overlay").classList.remove("active");
  document.getElementById("search-query").textContent = "";
  const timerBar = document.getElementById("search-timer-bar");
  timerBar.style.transition = "none";
  timerBar.style.width = "0%";
  document.querySelectorAll(".text-card").forEach(c => c.classList.remove("search-match"));
}
