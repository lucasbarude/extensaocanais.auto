const form = document.getElementById("add-form");
const handleInput = document.getElementById("handle-input");
const notifyCheck = document.getElementById("notify-check");
const autoOpenCheck = document.getElementById("autoopen-check");
const list = document.getElementById("list");
const empty = document.getElementById("empty");
const checkNowBtn = document.getElementById("check-now");
const checkStatus = document.getElementById("check-status");
const intervalInput = document.getElementById("interval-input");
const tabs = document.querySelectorAll(".tab");

let currentPlatform = "youtube";

// Ícones fornecidos pelo usuário (formato tabler-icons), embutidos como paths SVG.
const ICON_PATHS = {
  bellOn: `<path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" />`,
  bellOff: `<path d="M3 3l18 18" /><path d="M10 5a2 2 0 0 1 3.585 -1.133l.015 .013a7 7 0 0 1 4.4 6.12l0 .28v3m2 2h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 .12 -1.27" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" />`,
  linkOn: `<path d="M9 15l6 -6" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" />`,
  linkOff: `<path d="M9 15l3 -3m2 -2l1 -1" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M3 3l18 18" /><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" />`,
  videoAuto: `<path d="M12 20h-7a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v3.5" /><path d="M12 16a3 3 0 1 0 0 -6a3 3 0 0 0 0 6z" /><path d="M19 22v-6" /><path d="M22 19l-3 -3l-3 3" />`,
  menu: `<path d="M10 6h10" /><path d="M4 12h16" /><path d="M7 12h13" /><path d="M4 18h10" />`,
  search: `<path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" />`,
  trash: `<path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />`,
  pause: `<path d="M6 5m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" /><path d="M14 5m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />`,
  play: `<path d="M7 4v16l13 -8z" />`,
  close: `<path d="M18 6l-12 12" /><path d="M6 6l12 12" />`,
};

function svgIcon(name, size = 16) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;
}

async function getChannels() {
  const { channels = [] } = await chrome.storage.local.get("channels");
  return channels;
}

async function saveChannels(channels) {
  await chrome.storage.local.set({ channels });
  render();
}

async function loadSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  if (settings && settings.interval) intervalInput.value = settings.interval;
}

intervalInput.addEventListener("change", async (e) => {
  const newInterval = parseInt(e.target.value) || 5;
  await chrome.storage.local.set({ settings: { interval: newInterval } });
  chrome.runtime.sendMessage({ type: "UPDATE_ALARM" });
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentPlatform = tab.getAttribute("data-platform");
    handleInput.placeholder =
      currentPlatform === "twitch"
        ? "nome do canal na Twitch"
        : currentPlatform === "kick"
        ? "nome do canal na Kick"
        : "@canal ou url";
    openMenuHandle = null;
    render();
  });
});

function normalizeHandle(raw, platform) {
  let h = raw.trim();
  if (!h) return null;
  if (platform === "youtube" && !h.startsWith("@")) h = "@" + h;
  if ((platform === "twitch" || platform === "kick") && h.startsWith("@")) h = h.substring(1);
  return h;
}

function timeAgo(ts) {
  if (!ts) return "nunca verificado";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "verificado agora";
  if (diff < 3600) return `verificado há ${Math.floor(diff / 60)} min`;
  return `verificado há ${Math.floor(diff / 3600)} h`;
}

function timeAlive(ts) {
  if (!ts) return "";
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 60) return `Em live há ${diffMin} min`;
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return `Em live há ${hrs}h ${mins}m`;
}

function closeAnyMenu() {
  const existing = document.getElementById("options-overlay");
  if (existing) existing.remove();
}

// Salva sem re-renderizar a lista — assim o painel de opções não se fecha
// sozinho a cada clique (só sincroniza a lista principal quando o painel fecha).
async function saveChannelsQuiet(channels) {
  await chrome.storage.local.set({ channels });
}

function openOptionsPanel(ch, allChannels) {
  closeAnyMenu();

  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.id = "options-overlay";
  overlay.onclick = (e) => {
    if (e.target === overlay) closeOptionsPanel();
  };

  const panel = document.createElement("div");
  panel.className = "options-panel";
  overlay.appendChild(panel);

  const header = document.createElement("div");
  header.className = "options-panel-header";
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = ch.handle;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "close-btn";
  closeBtn.innerHTML = svgIcon("close", 16);
  closeBtn.title = "Fechar";
  closeBtn.onclick = () => closeOptionsPanel();
  header.append(title, closeBtn);
  panel.appendChild(header);

  function addItem({ getIcon, getLabel, getChecked, onToggle }) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "item";

    const labelWrap = document.createElement("span");
    labelWrap.className = "menu-item-label";
    const iconSpan = document.createElement("span");
    const textSpan = document.createElement("span");
    labelWrap.append(iconSpan, textSpan);
    item.append(labelWrap);

    let sw = null;
    if (getChecked) {
      sw = document.createElement("span");
      sw.className = "switch";
      sw.style.pointerEvents = "none";
      item.append(sw);
    }

    function refresh() {
      iconSpan.innerHTML = svgIcon(getIcon(), 14);
      textSpan.textContent = getLabel();
      if (sw) sw.innerHTML = `<input type="checkbox" ${getChecked() ? "checked" : ""}><span class="track"></span>`;
    }
    refresh();

    item.onclick = async (ev) => {
      ev.stopPropagation(); // clicar numa opção NÃO fecha o painel
      onToggle();
      await saveChannelsQuiet(allChannels);
      refresh();
    };

    panel.appendChild(item);
  }

  addItem({
    getIcon: () => (ch.paused ? "play" : "pause"),
    getLabel: () => (ch.paused ? "Retomar monitoramento" : "Pausar monitoramento"),
    onToggle: () => {
      ch.paused = !ch.paused;
    },
  });

  addItem({
    getIcon: () => (ch.autoOpen ? "linkOn" : "linkOff"),
    getLabel: () => "Abrir automaticamente",
    getChecked: () => ch.autoOpen,
    onToggle: () => {
      ch.autoOpen = !ch.autoOpen;
    },
  });

  // Notificar/abrir vídeo novo: só faz sentido pro YouTube
  if (ch.platform === "youtube") {
    addItem({
      getIcon: () => "videoAuto",
      getLabel: () => "Notificar novos vídeos",
      getChecked: () => ch.notifyVideos,
      onToggle: () => {
        ch.notifyVideos = !ch.notifyVideos;
      },
    });
    addItem({
      getIcon: () => "videoAuto",
      getLabel: () => "Abrir vídeo novo automaticamente",
      getChecked: () => ch.autoOpenVideos,
      onToggle: () => {
        ch.autoOpenVideos = !ch.autoOpenVideos;
      },
    });
  }

  document.body.appendChild(overlay);
}

function closeOptionsPanel() {
  closeAnyMenu();
  render(); // só sincroniza a lista principal (ex: "pausado") ao fechar
}

async function render() {
  const allChannels = await getChannels();
  const channels = allChannels.filter((c) => (c.platform || "youtube") === currentPlatform);

  list.innerHTML = "";
  empty.style.display = channels.length === 0 ? "block" : "none";

  for (const ch of channels) {
    const row = document.createElement("div");
    row.className = "channel" + (ch.paused ? " paused" : "");

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    if (ch.avatarUrl) {
      const img = document.createElement("img");
      img.src = ch.avatarUrl;
      img.alt = "";
      img.width = 30;
      img.height = 30;
      img.style.borderRadius = "50%";
      img.style.objectFit = "cover";
      img.onerror = () => {
        // se a URL falhar ao carregar, volta pro ícone genérico em vez de ficar quebrado
        avatar.innerHTML = "";
        avatar.textContent = "👤";
      };
      avatar.appendChild(img);
    } else {
      avatar.textContent = "👤";
    }

    const info = document.createElement("div");
    info.className = "info";

    const handleRow = document.createElement("div");
    handleRow.className = "handle-row";
    const handleEl = document.createElement("span");
    handleEl.className = "handle";
    handleEl.textContent = ch.handle;
    const platformEl = document.createElement("span");
    platformEl.className = "platform-label";
    platformEl.textContent = ch.platform || "youtube";
    handleRow.append(handleEl, platformEl);

    const statusEl = document.createElement("div");
    statusEl.className = "status" + (ch.isLive ? " live-status" : "");
    if (ch.paused) {
      statusEl.textContent = "pausado";
    } else if (ch.isLive) {
      statusEl.textContent = ch.liveSince ? timeAlive(ch.liveSince) : "AO VIVO";
    } else {
      statusEl.textContent = timeAgo(ch.lastChecked);
    }

    info.append(handleRow, statusEl);
    row.append(avatar, info);

    const actions = document.createElement("div");
    actions.className = "actions";

    // ▶ assistir — só clicável quando está ao vivo
    const watchBtn = document.createElement("button");
    watchBtn.type = "button";
    watchBtn.className = "icon-btn" + (ch.isLive ? " on" : " disabled");
    watchBtn.innerHTML = svgIcon("play", 14);
    watchBtn.title = ch.isLive ? "Assistir agora" : "Canal offline";
    watchBtn.onclick = () => {
      if (ch.isLive && ch.liveUrl) window.open(ch.liveUrl, "_blank");
    };

    // 🔔 notificar (liga/desliga) — troca o ícone (sino aceso/riscado), não só a cor
    const notifyBtn = document.createElement("button");
    notifyBtn.type = "button";
    notifyBtn.className = "icon-btn" + (ch.notify ? " on" : "");
    notifyBtn.innerHTML = svgIcon(ch.notify ? "bellOn" : "bellOff", 14);
    notifyBtn.title = ch.notify ? "Notificação ligada" : "Notificação desligada";
    notifyBtn.onclick = async () => {
      ch.notify = !ch.notify;
      await saveChannels(allChannels);
    };

    // 🔍 verificar só esse canal agora
    const checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = "icon-btn";
    checkBtn.innerHTML = svgIcon("search", 14);
    checkBtn.title = "Verificar este canal agora";
    checkBtn.onclick = async () => {
      checkBtn.classList.add("checking");
      chrome.runtime.sendMessage(
        { type: "CHECK_ONE", handle: ch.handle, platform: ch.platform },
        () => {
          render();
        }
      );
    };

    // ⋮ menu com pausar, abrir automático e (no YouTube) vídeo novo
    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "icon-btn";
    menuBtn.innerHTML = svgIcon("menu", 14);
    menuBtn.title = "Mais opções";
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      openOptionsPanel(ch, allChannels);
    };

    // 🗑️ remover
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "icon-btn remove";
    removeBtn.innerHTML = svgIcon("trash", 14);
    removeBtn.title = "Remover";
    removeBtn.onclick = async () => {
      const updated = allChannels.filter((c) => !(c.handle === ch.handle && c.platform === ch.platform));
      await saveChannels(updated);
    };

    actions.append(watchBtn, notifyBtn, checkBtn, menuBtn, removeBtn);
    row.append(actions);
    list.appendChild(row);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const handle = normalizeHandle(handleInput.value, currentPlatform);
  if (!handle) return;

  const channels = await getChannels();
  if (channels.some((c) => c.handle === handle && c.platform === currentPlatform)) {
    handleInput.value = "";
    return;
  }

  channels.push({
    platform: currentPlatform,
    handle,
    notify: notifyCheck.checked,
    autoOpen: autoOpenCheck.checked,
    paused: false,
    isLive: false,
    lastChecked: null,
    liveUrl: null,
    liveSince: null,
    notifyVideos: false,
    autoOpenVideos: false,
    channelId: null,
    lastVideoId: null,
    lastVideoUrl: null,
    lastVideoTitle: null,
    avatarUrl: null,
  });
  await saveChannels(channels);
  handleInput.value = "";

  checkStatus.textContent = "verificando...";
  chrome.runtime.sendMessage({ type: "CHECK_NOW" }, () => {
    checkStatus.textContent = "";
    render();
  });
});

checkNowBtn.addEventListener("click", () => {
  checkStatus.textContent = "verificando...";
  chrome.runtime.sendMessage({ type: "CHECK_NOW" }, () => {
    checkStatus.textContent = "";
    render();
  });
});

loadSettings();
render();
