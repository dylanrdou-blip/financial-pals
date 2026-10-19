// ============================================================
// You don't need to edit this file. Change config.js instead.
// ============================================================

const chatEl = document.getElementById("chat");
const startersEl = document.getElementById("starters");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const keyDialog = document.getElementById("keyDialog");
const keyInput = document.getElementById("keyInput");
const rememberBox = document.getElementById("rememberBox");
const statusEl = document.getElementById("status");

let history = []; // your plain questions and the bot's answers (no notes)
let busy = false;

// Notes (knowledge) state
let notes = [];            // each note: { title, text, vector }
let knowledgeText = "";
let useMeaning = false;    // true when meaning search is working
let loadingKnowledge = false;
const CACHE_KEY = "pal_vectors";

// ---------- Set up the page from config.js ----------
document.title = CONFIG.name;
document.getElementById("botName").textContent = CONFIG.name;
document.getElementById("botEmoji").textContent = CONFIG.emoji;
document.getElementById("botTagline").textContent = CONFIG.tagline;
document.documentElement.style.setProperty("--accent", CONFIG.themeColor);

// ---------- Light/dark switch ----------
const themeToggle = document.getElementById("themeToggle");

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.setAttribute("aria-checked", theme === "dark");
}

let savedTheme = null;
try { savedTheme = localStorage.getItem("theme"); } catch (e) {}
applyTheme(
  savedTheme ||
  (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
);

themeToggle.addEventListener("click", () => {
  const next =
    document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("theme", next); } catch (e) {}
});

// ---------- Safe text formatting ----------
function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bold(s) {
  return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

// Escapes HTML first, then turns **bold** and "- " bullets into formatting
function formatText(raw) {
  const lines = escapeHtml(raw).split("\n");
  let html = "";
  let inList = false;
  for (const line of lines) {
    const m = line.match(/^\s*[-*•]\s+(.*)$/);
    if (m) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += "<li>" + bold(m[1]) + "</li>";
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      if (line.trim() !== "") html += "<p>" + bold(line) + "</p>";
    }
  }
  if (inList) html += "</ul>";
  return html;
}

// ---------- Chat bubbles ----------
function scrollDown() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

function addUser(text) {
  const div = document.createElement("div");
  div.className = "bubble user";
  div.textContent = text;
  chatEl.appendChild(div);
  scrollDown();
}

// The "Sources" section that opens under a reply
function buildSources(list) {
  const details = document.createElement("details");
  details.className = "sources";
  const summary = document.createElement("summary");
  summary.textContent = "Sources (" + list.length + ")";
  details.appendChild(summary);

  const ol = document.createElement("ol");
  list.forEach((item) => {
    const li = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = item.note.title;
    const score = document.createElement("span");
    score.className = "score";
    score.textContent = " (score " + item.score.toFixed(2) + ")";
    const preview = document.createElement("div");
    const flat = item.note.text.replace(/\s+/g, " ");
    preview.textContent = flat.slice(0, 160) + (flat.length > 160 ? "…" : "");
    li.append(title, score, preview);
    ol.appendChild(li);
  });
  details.appendChild(ol);
  return details;
}

function addBot(text, isError, sources) {
  const div = document.createElement("div");
  div.className = "bubble bot" + (isError ? " error" : "");
  div.innerHTML = formatText(text);
  if (sources && sources.length) div.appendChild(buildSources(sources));
  chatEl.appendChild(div);
  scrollDown();
}

function showThinking() {
  const div = document.createElement("div");
  div.className = "bubble bot";
  div.innerHTML = '<div class="dots"><span></span><span></span><span></span></div>';
  chatEl.appendChild(div);
  scrollDown();
  return div;
}

// ---------- API key storage (wrapped in try/catch) ----------
function getKey() {
  let key = "";
  try { key = sessionStorage.getItem("gemini_key") || ""; } catch (e) {}
  if (!key) {
    try { key = localStorage.getItem("gemini_key") || ""; } catch (e) {}
  }
  return key;
}

function saveKey(key, remember) {
  try { sessionStorage.setItem("gemini_key", key); } catch (e) {}
  try {
    if (remember) localStorage.setItem("gemini_key", key);
    else localStorage.removeItem("gemini_key");
  } catch (e) {}
}

function removeKey() {
  try { sessionStorage.removeItem("gemini_key"); } catch (e) {}
  try { localStorage.removeItem("gemini_key"); } catch (e) {}
}

function openKeyDialog() {
  keyInput.value = "";
  let remembered = false;
  try { remembered = !!localStorage.getItem("gemini_key"); } catch (e) {}
  rememberBox.checked = remembered;
  keyDialog.showModal();
  keyInput.focus();
}

document.getElementById("keyBtn").addEventListener("click", openKeyDialog);
document.getElementById("keyCancel").addEventListener("click", () => keyDialog.close());
document.getElementById("keySave").addEventListener("click", () => {
  const key = keyInput.value.trim();
  if (key) {
    saveKey(key, rememberBox.checked);
    onKeySaved();
  }
  keyDialog.close();
});
document.getElementById("keyRemove").addEventListener("click", () => {
  removeKey();
  keyDialog.close();
});

// ---------- Friendly error messages ----------
function errorMessage(err) {
  if (err && err.status) {
    const s = err.status;
    if (s === 400 || s === 403) return "Your API key doesn't seem to work. Tap \"API key\" at the top and paste it again.";
    if (s === 429) return "I'm getting too many requests right now. Wait a minute and try again.";
    if (s === 404) return "I can't find that AI model. Check the model name in config.js.";
    if (s >= 500) return "Google's servers are having trouble. Try again in a bit.";
    return "Something went wrong (error " + s + "). Please try again.";
  }
  if (err && err.empty) return "I didn't get an answer back. Try rephrasing your question.";
  return "I can't connect. Check your internet and try again.";
}

// ============================================================
// KNOWLEDGE: reading your notes and finding the right ones
// ============================================================

function setStatus(text, problem) {
  statusEl.textContent = text;
  statusEl.classList.toggle("problem", !!problem);
}

function noteCount() {
  return notes.length + (notes.length === 1 ? " note" : " notes");
}

// Turn knowledge.md into a list of notes. Each note starts with "## Title".
function parseNotes(md) {
  const lines = md.replace(/\r/g, "").split("\n");
  const raw = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      current = { title: m[1].trim(), body: [] };
      raw.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  const result = [];
  for (const n of raw) {
    const text = n.body.join("\n").trim();
    if (!text) continue;
    const parts = splitLong(text, 1500);
    parts.forEach((part, i) => {
      result.push({
        title: parts.length > 1 ? n.title + " (part " + (i + 1) + ")" : n.title,
        text: part
      });
    });
  }
  return result;
}

// Split a long note at blank lines so each part is about 1,500 characters or less
function splitLong(text, max) {
  if (text.length <= max) return [text];
  const paragraphs = text.split(/\n\s*\n/);
  const parts = [];
  let cur = "";
  for (const p of paragraphs) {
    if (cur && cur.length + p.length + 2 > max) {
      parts.push(cur);
      cur = p;
    } else {
      cur = cur ? cur + "\n\n" + p : p;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

// A short code that changes whenever knowledge.md changes
function fingerprint(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16) + "-" + s.length;
}

function readCache(fp) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && data.fp === fp ? data.vectors : null;
  } catch (e) {
    return null;
  }
}

function writeCache(fp, vectors) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ fp: fp, vectors: vectors })); } catch (e) {}
}

// Turn pieces of text into lists of numbers ("embeddings")
async function embedTexts(texts, key) {
  const model = CONFIG.embeddingModel;
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":batchEmbedContents";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key
    },
    body: JSON.stringify({
      requests: texts.map((t) => ({
        model: "models/" + model,
        content: { parts: [{ text: t }] }
      }))
    })
  });

  if (!res.ok) throw { status: res.status };
  const data = await res.json();
  const list = data.embeddings || [];
  if (list.length !== texts.length) throw { empty: true };
  // Rounding keeps the saved numbers small
  return list.map((e) => e.values.map((x) => Math.round(x * 100000) / 100000));
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Keyword search helpers
const STOPWORDS = new Set(
  "the and for are but not you your with what how can does did who why when where this that from have has was were will would should could about into than then them they their there here out any all get got our its".split(" ")
);

function words(s) {
  const found = s.toLowerCase().match(/[a-z0-9']+/g) || [];
  return found
    .map((w) => w.replace(/'/g, ""))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

function keywordSearch(question, k) {
  const q = Array.from(new Set(words(question)));
  if (!q.length) return [];
  const scored = notes.map((n) => {
    const titleWords = new Set(words(n.title));
    const textWords = new Set(words(n.text));
    let hits = 0;
    q.forEach((w) => {
      if (titleWords.has(w)) hits += 1;
      if (textWords.has(w)) hits += 1;
    });
    return { note: n, score: hits / (q.length * 2) };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// Pick the best notes for a question
async function findNotes(question, key) {
  const k = CONFIG.topK || 3;
  if (CONFIG.searchMethod === "meaning" && useMeaning) {
    try {
      const vectors = await embedTexts(["task: search result | query: " + question], key);
      const q = vectors[0];
      return notes
        .map((n) => ({ note: n, score: cosine(q, n.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    } catch (err) {
      // Meaning search stopped working, so switch to keywords
      useMeaning = false;
      setStatus("📚 " + noteCount() + " loaded · keyword search (meaning search isn't working right now)");
    }
  }
  return keywordSearch(question, k);
}

// Make the numbers for every note (or load them from the saved copy)
async function prepareSearch() {
  useMeaning = false;

  if (CONFIG.searchMethod !== "meaning") {
    setStatus("📚 " + noteCount() + " loaded · keyword search");
    return;
  }

  const key = getKey();
  if (!key) {
    setStatus("📚 " + noteCount() + " loaded · keyword search for now (add your API key for meaning search)");
    return;
  }

  const fp = fingerprint(knowledgeText + "|" + CONFIG.embeddingModel);
  const cached = readCache(fp);
  if (cached && cached.length === notes.length) {
    notes.forEach((n, i) => { n.vector = cached[i]; });
    useMeaning = true;
    setStatus("📚 " + noteCount() + " loaded · meaning search");
    return;
  }

  setStatus("📚 Reading " + noteCount() + "...");
  try {
    const texts = notes.map((n) => "title: " + n.title + " | text: " + n.text);
    const vectors = [];
    for (let i = 0; i < texts.length; i += 50) {
      const part = await embedTexts(texts.slice(i, i + 50), key);
      part.forEach((v) => vectors.push(v));
    }
    notes.forEach((n, i) => { n.vector = vectors[i]; });
    writeCache(fp, vectors);
    useMeaning = true;
    setStatus("📚 " + noteCount() + " loaded · meaning search");
  } catch (err) {
    useMeaning = false;
    setStatus("📚 " + noteCount() + " loaded · keyword search (meaning search failed: " + errorMessage(err) + ")");
  }
}

// Load knowledge.md when the page opens
async function loadKnowledge() {
  if (!CONFIG.useKnowledge) {
    setStatus("");
    return;
  }
  if (loadingKnowledge) return;
  loadingKnowledge = true;
  setStatus("📚 Loading notes...");

  try {
    let res;
    try {
      res = await fetch(CONFIG.knowledgeFile + "?v=" + Date.now());
    } catch (e) {
      throw { missing: true };
    }
    if (!res.ok) throw { missing: true };
    knowledgeText = await res.text();
  } catch (err) {
    notes = [];
    setStatus("📚 I can't find " + CONFIG.knowledgeFile + ". Add it to your GitHub repository next to index.html.", true);
    loadingKnowledge = false;
    return;
  }

  notes = parseNotes(knowledgeText);
  if (!notes.length) {
    setStatus("📚 " + CONFIG.knowledgeFile + " has no notes yet. Start each note with a line like: ## Note title", true);
    loadingKnowledge = false;
    return;
  }

  await prepareSearch();
  loadingKnowledge = false;
}

// When a key is saved, finish setting up meaning search
async function onKeySaved() {
  if (!CONFIG.useKnowledge || loadingKnowledge) return;
  if (!notes.length) {
    await loadKnowledge();
  } else if (!useMeaning) {
    loadingKnowledge = true;
    await prepareSearch();
    loadingKnowledge = false;
  }
}

// The message sent to Gemini: numbered notes, then the question
function buildPrompt(question, found) {
  let block = "NOTES:\n";
  if (!found.length) {
    block += "(No matching notes were found.)\n";
  } else {
    found.forEach((item, i) => {
      block += "[" + (i + 1) + "] " + item.note.title + "\n" + item.note.text + "\n\n";
    });
  }
  return block + "\nQUESTION: " + question;
}

// ---------- Talking to Gemini ----------
async function sendMessage(text) {
  text = text.trim();
  if (!text || busy) return;

  const key = getKey();
  if (!key) {
    addBot("I need your Gemini API key before we can chat. Paste it in the pop-up.", true);
    openKeyDialog();
    return;
  }

  busy = true;
  sendBtn.disabled = true;
  startersEl.style.display = "none";
  addUser(text);
  inputEl.value = "";
  inputEl.style.height = "auto";
  history.push({ role: "user", parts: [{ text: text }] });
  const thinking = showThinking();

  try {
    const knowledgeOn = CONFIG.useKnowledge && notes.length > 0;
    let found = [];
    if (knowledgeOn) found = await findNotes(text, key);

    // History keeps your plain questions. Only the newest one gets the notes.
    const contents = history.slice(0, -1).concat([
      { role: "user", parts: [{ text: knowledgeOn ? buildPrompt(text, found) : text }] }
    ]);
    const system =
      CONFIG.systemInstructions + (knowledgeOn ? "\n\n" + CONFIG.knowledgeRules : "");

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(CONFIG.model) +
      ":generateContent";

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: contents
      })
    });

    if (!res.ok) throw { status: res.status };

    const data = await res.json();
    const parts =
      (data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts) || [];
    const reply = parts
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join("")
      .trim();

    if (!reply) throw { empty: true };

    history.push({ role: "model", parts: [{ text: reply }] });
    thinking.remove();
    addBot(reply, false, found);
  } catch (err) {
    history.pop(); // remove the question that failed
    thinking.remove();
    addBot(errorMessage(err), true);
  }

  busy = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

// ---------- Starter buttons and new chat ----------
function showStarters() {
  startersEl.innerHTML = "";
  startersEl.style.display = "flex";
  CONFIG.starterQuestions.forEach((q) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = q;
    b.addEventListener("click", () => sendMessage(q));
    startersEl.appendChild(b);
  });
}

function newChat() {
  history = [];
  chatEl.innerHTML = "";
  addBot(CONFIG.welcomeMessage);
  showStarters();
}

document.getElementById("newChatBtn").addEventListener("click", newChat);

// ---------- Sending: Enter sends, Shift+Enter makes a new line ----------
sendBtn.addEventListener("click", () => sendMessage(inputEl.value));
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendMessage(inputEl.value);
  }
});
inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
});

// ---------- Start ----------
newChat();
loadKnowledge();
