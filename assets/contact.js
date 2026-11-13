const inquiry = document.querySelector(".inquiry-form");
const sendButton = inquiry.querySelector("button[type=submit]");
const feedback = inquiry.querySelector(".inquiry-feedback");
inquiry.addEventListener("submit", (event) => {
  if (location.protocol === "file:") {
    event.preventDefault();
    feedback.textContent = "這是離線預覽。請從網站網址開啟此頁，再送出留言。";
    return;
  }
  const textFields = [inquiry.elements.namedItem("name"), inquiry.elements.namedItem("message")];
  for (const field of textFields) {
    field.value = field.value.trim();
    if (!field.reportValidity()) {
      event.preventDefault();
      return;
    }
  }
  if (sendButton.disabled) {
    event.preventDefault();
    return;
  }
  sendButton.disabled = true;
  feedback.textContent = "正在連線至 FormSubmit…";
});
window.addEventListener("pageshow", () => {
  sendButton.disabled = false;
  feedback.textContent = "";
});
