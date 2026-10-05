const chatEl = document.getElementById("chat");
const startersEl = document.getElementById("starters");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const keyDialog = document.getElementById("keyDialog");
const keyInput = document.getElementById("keyInput");
const rememberBox = document.getElementById("rememberBox");

let history = []; // the conversation sent to Gemini
let busy = false;

// ---------- Set up the page from config.js ----------
document.title = CONFIG.name;
document.getElementById("botName").textContent = CONFIG.name;
document.getElementById("botEmoji").textContent = CONFIG.emoji;
document.getElementById("botTagline").textContent = CONFIG.tagline;
document.documentElement.style.setProperty("--accent", CONFIG.themeColor);

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

function addBot(text, isError) {
  const div = document.createElement("div");
  div.className = "bubble bot" + (isError ? " error" : "");
  div.innerHTML = formatText(text);
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
  if (key) saveKey(key, rememberBox.checked);
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
        systemInstruction: { parts: [{ text: CONFIG.systemInstructions }] },
        contents: history
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
    addBot(reply);
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
