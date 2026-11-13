const menuButton = document.querySelector(".menu-toggle");
const navigation = document.getElementById("main-nav");
function setMenu(open) {
  menuButton.setAttribute("aria-expanded", String(open));
  navigation.classList.toggle("open", open);
  menuButton.querySelector(".menu-label").textContent = open ? "關閉" : "選單";
}
menuButton.addEventListener("click", () => setMenu(menuButton.getAttribute("aria-expanded") !== "true"));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && navigation.classList.contains("open")) {
    setMenu(false);
    menuButton.focus();
  }
});
document.addEventListener("click", event => {
  if (!event.target.closest(".mast") && navigation.classList.contains("open")) setMenu(false);
});
window.matchMedia("(min-width:781px)").addEventListener("change", event => {
  if (event.matches) setMenu(false);
});
document.querySelector(".copy")?.addEventListener("click", async () => {
  const address = document.querySelector("address");
  const status = document.querySelector(".status");
  try {
    await navigator.clipboard.writeText(address.textContent.trim());
    status.textContent = "已複製登記地址";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(address);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    status.textContent = "已選取地址，可使用裝置的複製功能。";
  }
});
