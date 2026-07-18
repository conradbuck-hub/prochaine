const thread = document.getElementById("thread");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("message");
const submitButton = composer.querySelector("button[type=submit]");

function addBubble(text, kind) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${kind}`;
  bubble.textContent = text;
  thread.appendChild(bubble);
  thread.scrollTop = thread.scrollHeight;
  return bubble;
}

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;

  addBubble(message, "user");
  messageInput.value = "";
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
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}
