// Documento invisível cuja única função é tocar o som de notificação.
// Existe porque o service worker do background (MV3) não tem acesso a <audio>.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "PLAY_SOUND") {
    const audio = document.getElementById("notify-audio");
    audio.currentTime = 0;
    audio.play().catch((err) => console.error("Canais: erro ao tocar som", err));
  }
});
