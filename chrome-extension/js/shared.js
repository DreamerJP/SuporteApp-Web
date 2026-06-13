"use strict";

/* ─── Storage (chrome.storage.local) ─────────────────────────────────────── */
const DEFAULTS = {
  texts:        [],
  ports:        [8081],
  opa:          { optimized: true, lines: 1 },
  jsonUrl:      "",
  theme:        null,
  lastCategory: "Todas",
};

function loadState() {
  return chrome.storage.local.get(DEFAULTS);
}

function saveState(partial) {
  return chrome.storage.local.set(partial);
}

/* ─── Textos ─────────────────────────────────────────────────────────────── */
// Normaliza: suporta objetos {text,label,category} e arrays legados [text, label, category]
function normalizeTexts(data) {
  return (Array.isArray(data) ? data : [])
    .map(item => {
      if (item && typeof item === "object" && !Array.isArray(item) && item.text && item.label)
        return { text: item.text, label: item.label, category: item.category || "Geral" };
      if (Array.isArray(item))
        return { text: item[0] || "", label: item[1] || "", category: item[2] || "Geral" };
      return null;
    })
    .filter(Boolean);
}

function getCategories(texts) {
  const set = new Set();
  texts.forEach(t => set.add(t.category || "Geral"));
  return [...set].sort();
}

/* ─── Cópia com otimização OPA ───────────────────────────────────────────── */
function formatForCopy(text, opa) {
  let formatted = text.trim();
  if (opa.optimized) {
    formatted = formatted.replace(/\n+/g, m => "\r\n".repeat(m.length + opa.lines));
  } else {
    formatted = formatted.replace(/\n/g, "\r\n");
  }
  return formatted;
}

/* ─── IP Opener ──────────────────────────────────────────────────────────── */
const IP_RE = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/;

function buildIpUrls(ip, ports) {
  const urls = [`http://${ip}`, `https://${ip}`];
  ports.forEach(port => {
    if (port !== 80 && port !== 443) {
      urls.push(`http://${ip}:${port}`);
      urls.push(`https://${ip}:${port}`);
    }
  });
  return urls;
}

// Extrai o IP do texto e abre todas as abas. Retorna o nº de abas abertas (0 = sem IP).
async function openIpTabs(text, ports) {
  const match = String(text).match(IP_RE);
  if (!match) return 0;
  const urls = buildIpUrls(match[1], ports);
  await Promise.all(urls.map(url => chrome.tabs.create({ url, active: false })));
  return urls.length;
}

/* ─── Tema ───────────────────────────────────────────────────────────────── */
function getContrastColor(hex) {
  hex = (hex || "#1a1a2e").replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 160 ? "#000000" : "#ffffff";
}

function applyTheme(bg, accent) {
  const root = document.documentElement;
  const bgText = getContrastColor(bg);

  root.style.setProperty("--bg", bg);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--text", bgText);
  root.style.setProperty("--accent-text", getContrastColor(accent));

  if (bgText === "#000000") {
    root.style.setProperty("--text-muted", "rgba(0,0,0,0.6)");
    root.style.setProperty("--border", "rgba(0,0,0,0.1)");
  } else {
    root.style.setProperty("--text-muted", "#a0a0b0");
    root.style.setProperty("--border", "rgba(255,255,255,0.1)");
  }
}

/* ─── Toast ──────────────────────────────────────────────────────────────── */
let toastTimer = null;

function showToast(msg, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
