const thread = document.getElementById("thread");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("message");
const submitButton = composer.querySelector("button[type=submit]");
const themeToggle = document.getElementById("theme-toggle");

const THEME_KEY = "prochaine-theme";
const THEME_CYCLE = ["auto", "light", "dark"];

function applyTheme(theme) {
  if (theme === "auto") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
  themeToggle.setAttribute("aria-label", `Theme: ${theme}`);
}

function currentTheme() {
  return localStorage.getItem(THEME_KEY) ?? "auto";
}

applyTheme(currentTheme());

themeToggle.addEventListener("click", () => {
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(currentTheme()) + 1) % THEME_CYCLE.length];
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

function addBubble(text, kind) {
  document.getElementById("empty-state")?.remove();
  const bubble = document.createElement("div");
  bubble.className = `bubble ${kind}`;
  bubble.textContent = text;
  thread.appendChild(bubble);
  thread.scrollTop = thread.scrollHeight;
  return bubble;
}

async function sendMessage(message) {
  addBubble(message, "user");
  submitButton.disabled = true;

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    if (!res.ok) {
      addBubble(data.error ?? `Error ${res.status}`, "error");
    } else {
      addBubble(data.reply, "bot");
    }
  } catch (err) {
    addBubble("Connection problem — try again.", "error");
  } finally {
    submitButton.disabled = false;
    messageInput.focus();
  }
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;
  messageInput.value = "";
  sendMessage(message);
});

for (const chip of document.querySelectorAll(".example-chip")) {
  chip.addEventListener("click", () => sendMessage(chip.textContent));
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}
