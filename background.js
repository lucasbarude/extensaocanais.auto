const ALARM_NAME = "streambell-check";

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return settings || { interval: 5 };
}

async function updateAlarm() {
  const settings = await getSettings();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: settings.interval });
}

chrome.runtime.onInstalled.addListener(updateAlarm);
chrome.runtime.onStartup.addListener(updateAlarm);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkAllChannels();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "CHECK_NOW") {
    checkAllChannels(true).then(() => sendResponse({ done: true }));
    return true;
  }
  if (msg?.type === "UPDATE_ALARM") {
    updateAlarm().then(() => sendResponse({ done: true }));
    return true;
  }
  if (msg?.type === "CHECK_ONE") {
    (async () => {
      const { channels = [] } = await chrome.storage.local.get("channels");
      const ch = channels.find((c) => c.handle === msg.handle && c.platform === msg.platform);
      if (ch) {
        await checkChannel(ch, true); // true = trata como manual, notifica se já estiver ao vivo
        await updateBadge();
      }
      sendResponse({ done: true });
    })();
    return true;
  }
});

async function updateBadge() {
  const { channels = [] } = await chrome.storage.local.get("channels");
  const liveCount = channels.filter((c) => c.isLive && !c.paused).length;
  await chrome.action.setBadgeText({ text: liveCount > 0 ? String(liveCount) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#8b5cf6" });
}

async function checkAllChannels(isManualCheck = false) {
  const { channels = [] } = await chrome.storage.local.get("channels");

  for (const c of channels) {
    if (!c.paused) {
      await checkChannel(c, isManualCheck);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  // Isso estava faltando na versão anterior: sem essa chamada, o número
  // no ícone nunca era atualizado, mesmo com canais ao vivo.
  await updateBadge();
}

async function resolveChannelId(handle) {
  const cleanHandle = handle.startsWith("@") ? handle : `@${handle}`;
  const res = await fetch(`https://www.youtube.com/${cleanHandle}`);
  const html = await res.text();
  const match = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{20,26})"/);
  return match ? match[1] : null;
}

// Busca a foto de perfil do canal. Roda só uma vez (fica em cache em avatarUrl),
// pra não gerar checagem extra toda vez — só refaz se a extração falhar.
async function resolveAvatar(handle) {
  const cleanHandle = handle.startsWith("@") ? handle : `@${handle}`;
  const res = await fetch(`https://www.youtube.com/${cleanHandle}`);
  const html = await res.text();
  const match = html.match(/"avatar":\s*\{\s*"thumbnails":\s*\[\s*\{\s*"url":\s*"([^"]+)"/);
  return match ? match[1] : null;
}

async function fetchLatestVideo(channelId) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  const xml = await res.text();
  const entryMatch = xml.match(/<entry>[\s\S]*?<\/entry>/);
  if (!entryMatch) return null;

  const entry = entryMatch[0];
  const idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
  const linkMatch = entry.match(/<link rel="alternate" href="([^"]+)"/);
  const titleMatch = entry.match(/<title>([^<]*)<\/title>/);
  if (!idMatch) return null;

  return {
    videoId: idMatch[1],
    url: linkMatch ? linkMatch[1] : `https://www.youtube.com/watch?v=${idMatch[1]}`,
    title: titleMatch ? titleMatch[1] : "",
  };
}

// Checa se saiu vídeo novo (só roda se o canal tiver notifyVideos ou autoOpenVideos ligado,
// pra não gerar tráfego extra em quem não usa essa opção)
async function checkNewVideo(channelConfig) {
  if (channelConfig.platform !== "youtube") return;
  if (!channelConfig.notifyVideos && !channelConfig.autoOpenVideos) return;

  try {
    let channelId = channelConfig.channelId;
    if (!channelId) {
      channelId = await resolveChannelId(channelConfig.handle);
      if (!channelId) return;
    }

    const latest = await fetchLatestVideo(channelId);

    const { channels = [] } = await chrome.storage.local.get("channels");
    const idx = channels.findIndex(
      (c) => c.handle === channelConfig.handle && c.platform === "youtube"
    );
    if (idx === -1) return;

    channels[idx].channelId = channelId;

    if (latest) {
      const isFirstRun = !channels[idx].lastVideoId;
      const isNew = !isFirstRun && channels[idx].lastVideoId !== latest.videoId;

      channels[idx].lastVideoId = latest.videoId;
      channels[idx].lastVideoUrl = latest.url;
      channels[idx].lastVideoTitle = latest.title;

      await chrome.storage.local.set({ channels });

      // Na primeira vez que ativa a opção, só guarda o vídeo atual como referência
      // (não notifica, senão notificaria de um vídeo que já existia há tempos)
      if (isNew) {
        await onNewVideo(channels[idx]);
      }
    } else {
      await chrome.storage.local.set({ channels });
    }
  } catch (err) {
    console.error(`Canais: erro ao checar vídeos de ${channelConfig.handle}`, err);
  }
}

async function onNewVideo(channel) {
  if (channel.notifyVideos) {
    const notifId = `streambell-${crypto.randomUUID()}`;
    const { notifMap = {} } = await chrome.storage.local.get("notifMap");
    notifMap[notifId] = { url: channel.lastVideoUrl };
    await chrome.storage.local.set({ notifMap });

    chrome.notifications.create(notifId, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Canais",
      message: `Novo vídeo de ${channel.handle}${channel.lastVideoTitle ? ": " + channel.lastVideoTitle : ""}`,
      priority: 1,
    });
    await playNotificationSound();
  }
  if (channel.autoOpenVideos && channel.lastVideoUrl) {
    chrome.tabs.create({ url: channel.lastVideoUrl });
  }
}

async function checkChannel(channelConfig, isManualCheck = false) {
  try {
    let isLive = false;
    let liveUrl = "";
    let detectedAvatarUrl = null; // só usado pra twitch/kick — extraído do mesmo HTML, sem fetch extra

    if (channelConfig.platform === "twitch") {
      const cleanHandle = channelConfig.handle.replace("@", "").trim().toLowerCase();
      liveUrl = `https://www.twitch.tv/${cleanHandle}`;
      const res = await fetch(liveUrl, { redirect: "follow" });
      const html = await res.text();

      // Bug corrigido: a Twitch inclui "isLiveBroadcast" no HTML mesmo com o
      // canal offline (valor "false"). "includes('isLiveBroadcast')" dava
      // sempre true. Precisa checar o VALOR, não só a presença da palavra.
      isLive = /"isLiveBroadcast"\s*:\s*true/.test(html);

      // Foto do canal: URLs de avatar da Twitch vêm desse CDN específico.
      const avatarMatch = html.match(
        /https:\/\/static-cdn\.jtvnw\.net\/jtv_user_pictures\/[a-zA-Z0-9\-_/.]+\.(?:png|jpe?g)/
      );
      if (avatarMatch) detectedAvatarUrl = avatarMatch[0];
    } else if (channelConfig.platform === "kick") {
      const cleanHandle = channelConfig.handle.replace("@", "").trim().toLowerCase();
      liveUrl = `https://kick.com/${cleanHandle}`;

      // A página do canal na Kick é fortemente protegida por Cloudflare e o status
      // de "ao vivo" não vem no HTML inicial (é carregado depois, via JS, no navegador
      // de verdade). O caminho confiável é o endpoint JSON público da própria Kick.
      const apiRes = await fetch(`https://kick.com/api/v1/channels/${cleanHandle}`, {
        headers: { Accept: "application/json" },
      });
      if (!apiRes.ok) {
        throw new Error(`Kick API respondeu ${apiRes.status} (pode ser bloqueio da Cloudflare)`);
      }
      const data = await apiRes.json();

      isLive = !!(data && data.livestream);
      const apiAvatar = data?.user?.profile_pic || data?.profile_picture || null;
      if (apiAvatar) detectedAvatarUrl = apiAvatar;
    } else {
      const cleanHandle = channelConfig.handle.startsWith("@") ? channelConfig.handle : `@${channelConfig.handle}`;
      liveUrl = `https://www.youtube.com/${cleanHandle}/live`;
      const res = await fetch(liveUrl, { redirect: "follow" });
      const html = await res.text();
      isLive = /"isLive"\s*:\s*true/.test(html) || /"isLiveBroadcast"\s*:\s*true/.test(html);
    }

    const { channels = [] } = await chrome.storage.local.get("channels");
    const idx = channels.findIndex(
      (c) => c.handle === channelConfig.handle && c.platform === channelConfig.platform
    );
    if (idx === -1) return; // canal foi removido enquanto checávamos

    const wasLive = !!channels[idx].isLive;
    channels[idx].isLive = isLive;
    channels[idx].lastChecked = Date.now();

    if (isLive) {
      channels[idx].liveUrl = liveUrl;
      if (!wasLive) channels[idx].liveSince = Date.now();
    } else {
      channels[idx].liveSince = null;
    }

    // Busca a foto do canal uma única vez (fica salva em avatarUrl).
    if (channelConfig.platform === "youtube" && !channels[idx].avatarUrl) {
      // YouTube precisa de uma busca à parte (a página de /live nem sempre
      // é a página do canal em si, então o avatar pode não estar nela).
      try {
        const avatarUrl = await resolveAvatar(channelConfig.handle);
        if (avatarUrl) channels[idx].avatarUrl = avatarUrl;
      } catch (avatarErr) {
        console.error(`Canais: erro ao buscar avatar de ${channelConfig.handle}`, avatarErr);
      }
    } else if (!channels[idx].avatarUrl && detectedAvatarUrl) {
      // Twitch/Kick: já veio de graça no HTML que buscamos pra checar live.
      channels[idx].avatarUrl = detectedAvatarUrl;
    }

    await chrome.storage.local.set({ channels });

    // Notifica quando acabou de ficar ao vivo, OU quando você clicou em
    // "Verificar agora" manualmente e o canal já está ao vivo.
    if (isLive && (!wasLive || isManualCheck)) {
      await onChannelWentLive(channels[idx]);
    }

    // Checagem de vídeo novo é independente da de live (só roda se ligada pro canal)
    await checkNewVideo(channelConfig);
  } catch (err) {
    console.error(`Canais: erro ao checar ${channelConfig.handle}`, err);
  }
}

async function ensureOffscreenDocument() {
  const has = await chrome.offscreen.hasDocument();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Tocar o som de notificação quando um canal fica ao vivo ou publica vídeo novo",
  });
}

async function playNotificationSound() {
  try {
    await ensureOffscreenDocument();
    chrome.runtime.sendMessage({ type: "PLAY_SOUND" });
  } catch (err) {
    console.error("Canais: erro ao tocar som de notificação", err);
  }
}

async function onChannelWentLive(channel) {
  const platformLabel =
    channel.platform === "twitch" ? "Twitch" : channel.platform === "kick" ? "Kick" : "YouTube";

  if (channel.notify) {
    const notifId = `streambell-${crypto.randomUUID()}`;

    // Guarda a URL ligada a esse ID de notificação, em vez de tentar recuperar
    // isso fazendo notifId.split("-") (isso quebrava pra handles com hífen).
    const { notifMap = {} } = await chrome.storage.local.get("notifMap");
    notifMap[notifId] = { url: channel.liveUrl };
    await chrome.storage.local.set({ notifMap });

    chrome.notifications.create(notifId, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Canais",
      message: `${channel.handle} está ao vivo na ${platformLabel}!`,
      priority: 2,
    });
    await playNotificationSound();
  }
  if (channel.autoOpen && channel.liveUrl) {
    chrome.tabs.create({ url: channel.liveUrl });
  }
}

chrome.notifications.onClicked.addListener(async (notifId) => {
  if (!notifId.startsWith("streambell-")) return;

  const { notifMap = {} } = await chrome.storage.local.get("notifMap");
  const entry = notifMap[notifId];
  if (entry?.url) chrome.tabs.create({ url: entry.url });

  delete notifMap[notifId];
  await chrome.storage.local.set({ notifMap });
});

// Limpa o mapa quando a notificação é fechada (clicada, descartada ou expira),
// pra não acumular lixo no storage com o tempo.
chrome.notifications.onClosed.addListener(async (notifId) => {
  if (!notifId.startsWith("streambell-")) return;
  const { notifMap = {} } = await chrome.storage.local.get("notifMap");
  if (notifMap[notifId]) {
    delete notifMap[notifId];
    await chrome.storage.local.set({ notifMap });
  }
});
