document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('extract-form');
  const targetUrlInput = document.getElementById('target-url');
  const submitBtn = document.getElementById('submit-btn');
  const terminalSection = document.getElementById('terminal-section');
  const terminalLogs = document.getElementById('terminal-logs');
  const errorCard = document.getElementById('error-card');
  const errorMessage = document.getElementById('error-message');
  const resultsSection = document.getElementById('results-section');
  const pageTitle = document.getElementById('page-title');
  const cfWarning = document.getElementById('cloudflare-warning');

  // Settings elements
  const settingsToggle = document.getElementById('settings-toggle');
  const settingsPanel = document.getElementById('settings-panel');
  const apiServerUrlInput = document.getElementById('api-server-url');
  const saveSettingsBtn = document.getElementById('save-settings-btn');

  // Load API Server URL from localStorage
  let apiServerUrl = localStorage.getItem('neem_api_server') || '';
  apiServerUrlInput.value = apiServerUrl;

  // Settings Toggle
  settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
  });

  // Save Settings
  saveSettingsBtn.addEventListener('click', () => {
    const val = apiServerUrlInput.value.trim();
    localStorage.setItem('neem_api_server', val);
    apiServerUrl = val;
    addLog(`⚙️ API Sunucu Adresi Kaydedildi: ${val || 'Otomatik Algıla'}`, 'success');
    settingsPanel.classList.add('hidden');
  });

  // Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Counts
  const countDeep = document.getElementById('count-deep');
  const countNetwork = document.getElementById('count-network');
  const countIframes = document.getElementById('count-iframes');
  const countStreams = document.getElementById('count-streams');
  const countVideos = document.getElementById('count-videos');

  // Lists
  const deepList = document.getElementById('deep-list');
  const networkList = document.getElementById('network-list');
  const iframesList = document.getElementById('iframes-list');
  const streamsList = document.getElementById('streams-list');
  const videosList = document.getElementById('videos-list');

  // Empties
  const deepEmpty = document.getElementById('deep-empty');
  const networkEmpty = document.getElementById('network-empty');
  const iframesEmpty = document.getElementById('iframes-empty');
  const streamsEmpty = document.getElementById('streams-empty');
  const videosEmpty = document.getElementById('videos-empty');

  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  function switchTab(tabId) {
    tabButtons.forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });
    tabContents.forEach(c => {
      c.classList.toggle('active', c.id === tabId);
    });
  }

  // Terminal log helper
  function addLog(text, type = 'info') {
    const time = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    const logLine = document.createElement('div');
    logLine.className = 'log-line';
    logLine.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="log-text ${type}">${text}</span>
    `;
    terminalLogs.appendChild(logLine);
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
  }

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = targetUrlInput.value.trim();
    if (!url) return;

    // Reset UI
    errorCard.classList.add('hidden');
    resultsSection.classList.add('hidden');
    cfWarning.classList.add('hidden');
    terminalSection.classList.remove('hidden');
    terminalLogs.innerHTML = '';

    targetUrlInput.disabled = true;
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.7';
    submitBtn.querySelector('span').innerText = 'Taranıyor...';

    // Log steps simulating real Puppeteer deep-scan flow
    const logSteps = [
      { text: '🚀 Headless Chrome başlatılıyor...', type: 'info', delay: 100 },
      { text: '🛡️ Stealth modu aktif — bot tespiti gizleniyor', type: 'info', delay: 600 },
      { text: '🌐 Ağ trafiği interceptor başlatıldı', type: 'success', delay: 1200 },
      { text: `📡 Faz 1: Ana sayfa yükleniyor: ${url.substring(0, 55)}...`, type: 'info', delay: 1800 },
      { text: '⏳ JavaScript render bekleniyor...', type: 'info', delay: 3500 },
      { text: '🔍 DOM taranıyor — iframe, video, script etiketleri', type: 'info', delay: 5500 },
      { text: '🔎 Faz 2: Embed oynatıcılar derin taranıyor...', type: 'warning', delay: 8000 },
      { text: '🎯 Oynatıcı sayfaları Referer ile açılıyor...', type: 'info', delay: 10000 },
      { text: '▶️ Play butonu aranıyor ve tıklanıyor...', type: 'info', delay: 13000 },
      { text: '📶 Ağ trafiği dinleniyor — .m3u8 / .mp4 yakalanıyor...', type: 'info', delay: 16000 },
      { text: '📦 Sonuçlar derleniyor ve tekilleştiriliyor...', type: 'info', delay: 20000 },
    ];

    logSteps.forEach(step => {
      setTimeout(() => {
        if (!submitBtn.disabled) return;
        addLog(step.text, step.type);
      }, step.delay);
    });

    let data;
    let localApiSuccess = false;

    // Determine target API endpoints
    const endpoints = [];
    if (apiServerUrl) {
      // Ensure custom server URL ends correctly
      const base = apiServerUrl.endsWith('/') ? apiServerUrl.slice(0, -1) : apiServerUrl;
      endpoints.push(`${base}/api/extract`);
    } else {
      endpoints.push('/api/extract');
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        endpoints.push('http://localhost:3000/api/extract');
      }
    }

    // Try endpoints sequentially
    for (const endpoint of endpoints) {
      try {
        addLog(`📡 Sunucuya bağlanılıyor: ${endpoint.substring(0, 45)}...`, "info");
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });

        if (response.ok) {
          data = await response.json();
          localApiSuccess = true;
          addLog("⚡ Puppeteer API sunucusu başarıyla kullanıldı.", "success");
          break; // Stop trying other endpoints
        } else {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.error || `Sunucu hatası: ${response.status}`);
        }
      } catch (error) {
        console.warn(`Connection failed for endpoint: ${endpoint}`, error);
        addLog(`⚠️ Sunucu hatası (${endpoint.substring(0, 30)}): ${error.message}`, "warning");
      }
    }

    // 3. Fallback to client-side proxy scanner if local/remote server APIs are unavailable
    if (!localApiSuccess) {
      addLog("⚠️ API Sunucusu aktif değil veya CORS engeli var. Tarayıcı üzerinden (Client-Side) tarama başlatılıyor...", "warning");
      try {
        data = await extractClientSide(url);
      } catch (clientError) {
        setTimeout(() => {
          addLog(`❌ HATA: ${clientError.message}`, 'error');
          setTimeout(() => {
            errorMessage.innerText = clientError.message;
            errorCard.classList.remove('hidden');
            resetFormState();
          }, 800);
        }, 1500);
        return;
      }
    }

    const totalFound =
      (data.deepStreams?.length || 0) +
      (data.networkStreams?.length || 0) +
      (data.iframes?.length || 0) +
      (data.scriptStreams?.length || 0) +
      (data.videos?.length || 0);

    setTimeout(() => {
      addLog(`✅ Analiz tamamlandı — ${totalFound} bağlantı bulundu`, 'success');

      setTimeout(() => {
        renderResults(data);
        resetFormState();
      }, 600);
    }, 500);
  });

  function resetFormState() {
    targetUrlInput.disabled = false;
    submitBtn.disabled = false;
    submitBtn.style.opacity = '1';
    submitBtn.querySelector('span').innerText = 'Analiz Et';
    terminalSection.classList.add('hidden');
  }

  function renderResults(data) {
    // Clear all lists
    deepList.innerHTML = '';
    networkList.innerHTML = '';
    iframesList.innerHTML = '';
    streamsList.innerHTML = '';
    videosList.innerHTML = '';

    pageTitle.innerText = data.info?.title || 'Analiz Edilen Sayfa';

    // Cloudflare warning
    if (data.info?.cloudflareDetected) {
      cfWarning.classList.remove('hidden');
    }

    // ★ Deep Streams (most valuable — from embed player deep scan)
    const deep = data.deepStreams || [];
    countDeep.innerText = deep.length;
    if (deep.length > 0) {
      deepEmpty.classList.add('hidden');
      deep.forEach(item => {
        deepList.appendChild(createLinkRow(item.source || '⭐ Derin Tarama', item.url, item.format, 'deep'));
      });
    } else {
      deepEmpty.classList.remove('hidden');
    }

    // Network Streams
    const netStreams = data.networkStreams || [];
    countNetwork.innerText = netStreams.length;
    if (netStreams.length > 0) {
      networkEmpty.classList.add('hidden');
      netStreams.forEach(item => {
        networkList.appendChild(createLinkRow('Ağ Trafiği', item.url, item.format, 'network'));
      });
    } else {
      networkEmpty.classList.remove('hidden');
    }

    // Iframes
    const iframes = data.iframes || [];
    countIframes.innerText = iframes.length;
    if (iframes.length > 0) {
      iframesEmpty.classList.add('hidden');
      iframes.forEach(item => {
        iframesList.appendChild(createLinkRow(item.name, item.url, 'IFRAME', 'iframe'));
      });
    } else {
      iframesEmpty.classList.remove('hidden');
    }

    // Script Streams
    const streams = data.scriptStreams || [];
    countStreams.innerText = streams.length;
    if (streams.length > 0) {
      streamsEmpty.classList.add('hidden');
      streams.forEach(item => {
        streamsList.appendChild(createLinkRow('Script İçi Link', item.url, item.format, 'stream'));
      });
    } else {
      streamsEmpty.classList.remove('hidden');
    }

    // Videos
    const videos = data.videos || [];
    countVideos.innerText = videos.length;
    if (videos.length > 0) {
      videosEmpty.classList.add('hidden');
      videos.forEach(item => {
        videosList.appendChild(createLinkRow(item.type, item.url, 'VIDEO', 'video'));
      });
    } else {
      videosEmpty.classList.remove('hidden');
    }

    resultsSection.classList.remove('hidden');

    // Auto-switch to the tab that has the best results
    if (deep.length > 0) switchTab('tab-deep');
    else if (netStreams.length > 0) switchTab('tab-network');
    else if (iframes.length > 0) switchTab('tab-iframes');
    else if (streams.length > 0) switchTab('tab-streams');
    else if (videos.length > 0) switchTab('tab-videos');
    else switchTab('tab-deep');
  }

  function getBadgeStyle(formatLabel, cardType) {
    const f = (formatLabel || '').toUpperCase();
    if (cardType === 'deep') return 'style="background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)"';
    if (cardType === 'network') return 'style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)"';
    if (f.includes('M3U8') || f.includes('HLS')) return 'style="background: linear-gradient(135deg, #10b981 0%, #059669 100%)"';
    if (f.includes('DASH') || f.includes('MPD')) return 'style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"';
    if (f.includes('MP4')) return 'style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)"';
    if (f.includes('WEBM')) return 'style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)"';
    if (f === 'IFRAME') return 'style="background: linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)"';
    return '';
  }

  function createLinkRow(title, url, formatLabel, cardType) {
    const card = document.createElement('div');
    card.className = 'link-card';
    if (cardType === 'deep') card.classList.add('link-card-highlight');

    const badgeStyle = getBadgeStyle(formatLabel, cardType);
    const shortUrl = url.length > 80 ? url.substring(0, 80) + '…' : url;

    card.innerHTML = `
      <div class="link-info">
        <div class="link-label">
          <span>${title}</span>
          <span class="format-badge" ${badgeStyle}>${formatLabel}</span>
        </div>
        <div class="link-url" title="${url}">${shortUrl}</div>
      </div>
      <div class="link-actions">
        <button class="action-btn copy-btn" title="Linki Kopyala">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
        <a href="${url}" target="_blank" class="action-btn open-btn" title="Yeni Sekmede Aç">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>
      </div>
    `;

    const copyBtn = card.querySelector('.copy-btn');
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(url).then(() => {
        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
          copyBtn.classList.remove('copied');
        }, 1500);
      });
    });

    return card;
  }

  // Client-Side Proxy Scraper Logic (Netlify fallback when local backend is not running)
  async function fetchHtmlViaProxy(targetUrl) {
    // 1. Try CorsProxy.io first (fast raw output)
    try {
      const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 100) return text;
      }
    } catch (e) {
      console.warn("CorsProxy.io failed, trying AllOrigins...", e);
    }

    // 2. Try AllOrigins second (wrapped JSON)
    try {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.contents && json.contents.trim().length > 100) return json.contents;
      }
    } catch (e) {
      console.warn("AllOrigins proxy failed, trying CodeTabs...", e);
    }

    // 3. Try CodeTabs third (raw text)
    try {
      const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`);
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 100) return text;
      }
    } catch (e) {
      console.warn("CodeTabs proxy failed too.", e);
    }

    throw new Error("Hedef sayfa CORS/Cloudflare koruması altında. Tarayıcı üzerinden (Client-Side) doğrudan erişim engellendi. Lütfen yerel Puppeteer sunucusunu başlatın (node server.js) veya başka bir link deneyin.");
  }

  async function extractClientSide(targetUrl) {
    addLog("📥 Hedef sayfa HTML'i CORS proxy üzerinden alınıyor...", "info");
    const html = await fetchHtmlViaProxy(targetUrl);
    
    addLog("🔍 HTML içeriği parse ediliyor...", "info");
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const result = {
      title: doc.title || 'Başlıksız Sayfa',
      iframes: [],
      videos: [],
      scriptStreams: [],
      deepStreams: [],
      networkStreams: [] // Network interception is server-only, keep empty on client
    };

    // 1. Extract Iframes
    doc.querySelectorAll('iframe').forEach((el, i) => {
      const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-lazy-src');
      if (src && src.trim() && src.trim() !== 'about:blank') {
        const name = el.getAttribute('name') || el.getAttribute('id') || el.getAttribute('title') || `Oynatıcı ${i + 1}`;
        let resolved = src.trim();
        if (!resolved.startsWith('http')) {
          try {
            resolved = new URL(resolved, targetUrl).href;
          } catch {}
        }
        result.iframes.push({ name: name.trim(), url: resolved });
      }
    });

    // 2. Extract HTML5 Videos
    doc.querySelectorAll('video').forEach(videoEl => {
      const src = videoEl.getAttribute('src') || videoEl.getAttribute('data-src');
      if (src && !src.startsWith('blob:')) {
        result.videos.push({ type: 'Video Etiketi', url: src });
      }
      videoEl.querySelectorAll('source').forEach(sourceEl => {
        const ssrc = sourceEl.getAttribute('src') || sourceEl.getAttribute('data-src');
        const type = sourceEl.getAttribute('type') || 'Bilinmeyen';
        if (ssrc && !ssrc.startsWith('blob:')) {
          result.videos.push({ type: `Source (${type})`, url: ssrc });
        }
      });
    });

    // Patterns
    const STREAM_PATTERNS = [
      /\.(m3u8|mp4|webm|mpd|mkv|avi|flv|mov)(\?|$|#)/i,
      /\.ts(\?|$)/i,
      /\/playlist\.(m3u8|mpd)/i,
      /\/hls\/.*\.(m3u8|ts)/i,
      /\/dash\/.*\.(mpd|m4s)/i
    ];
    const EXCLUDE_PATTERNS = [
      /analytics/i, /telemetry/i, /tracker/i, /logger/i, /beacon/i, /metrics/i, /pixel/i, /adsystem/i, /doubleclick/i, /google-analytics/i
    ];

    function isStreamUrl(url) {
      if (!url || typeof url !== 'string') return false;
      if (EXCLUDE_PATTERNS.some(p => p.test(url))) return false;
      return STREAM_PATTERNS.some(p => p.test(url));
    }

    // 3. Extract Script Streams
    const streamRegex = /https?:\/\/[^\s"'`<>]+?\.(m3u8|mp4|webm|mpd)(\?[^\s"'`<>]+)?/gi;
    const jsConfigRegex = /(?:file|src|source|url|stream|video_url|video_link|hls_url|dash_url)\s*[:=]\s*["'`]([^"'`]+\.(?:m3u8|mp4|webm|mpd)[^"'`]*)/gi;

    doc.querySelectorAll('script').forEach(scriptEl => {
      const content = scriptEl.textContent || scriptEl.innerHTML || '';
      if (content.length > 0) {
        let match;
        streamRegex.lastIndex = 0;
        while ((match = streamRegex.exec(content)) !== null) {
          const u = match[0].replace(/\\\//g, '/').replace(/\\\\/g, '');
          if (isStreamUrl(u)) result.scriptStreams.push(u);
        }
        jsConfigRegex.lastIndex = 0;
        while ((match = jsConfigRegex.exec(content)) !== null) {
          const u = match[1].replace(/\\\//g, '/').replace(/\\\\/g, '');
          if (isStreamUrl(u)) result.scriptStreams.push(u);
        }
      }
    });

    result.scriptStreams = [...new Set(result.scriptStreams)];

    // 4. Client-side Deep Scan for iframe embed players!
    if (result.iframes.length > 0) {
      addLog(`🔎 Faz 2: ${result.iframes.length} embed oynatıcı derin taranıyor (Client-side)...`, "warning");
      
      for (const iframe of result.iframes) {
        try {
          addLog(`  ↳ Derin tarama: ${iframe.url.substring(0, 50)}...`, "info");
          const iframeHtml = await fetchHtmlViaProxy(iframe.url);
          if (iframeHtml) {
            const parser2 = new DOMParser();
            const doc2 = parser2.parseFromString(iframeHtml, 'text/html');
            
            doc2.querySelectorAll('script').forEach(scriptEl => {
              const content = scriptEl.textContent || scriptEl.innerHTML || '';
              let match;
              streamRegex.lastIndex = 0;
              while ((match = streamRegex.exec(content)) !== null) {
                const u = match[0].replace(/\\\//g, '/').replace(/\\\\/g, '');
                if (isStreamUrl(u)) result.deepStreams.push(u);
              }
              jsConfigRegex.lastIndex = 0;
              while ((match = jsConfigRegex.exec(content)) !== null) {
                const u = match[1].replace(/\\\//g, '/').replace(/\\\\/g, '');
                if (isStreamUrl(u)) result.deepStreams.push(u);
              }
            });
          }
        } catch (err) {
          console.warn("Iframe deep scan failed:", iframe.url, err);
        }
      }
      
      result.deepStreams = [...new Set(result.deepStreams)];
    }

    return result;
  }
});
