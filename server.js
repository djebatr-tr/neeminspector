const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');
const path = require('path');
const { URL } = require('url');

// Stealth plugin: masks headless browser fingerprint to bypass Cloudflare/WAF
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── URL resolver ─────────────────────────────────────────────────────────────
function resolveUrl(baseUrl, relativeUrl) {
  if (!relativeUrl) return null;
  try {
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) return relativeUrl;
    if (relativeUrl.startsWith('//')) return `https:${relativeUrl}`;
    return new URL(relativeUrl, baseUrl).href;
  } catch { return null; }
}

// ─── Stream URL patterns to intercept from network (MEDIA FILES ONLY) ────────
const MEDIA_EXTENSIONS = /\.(m3u8|mp4|webm|mpd|mkv|avi|flv|mov|m4s|ts)(\?|$|#)/i;
const MEDIA_PATHS = /\/(hls|dash|stream|playlist|master|index)\//i;

// URLs to EXCLUDE from network capture
const EXCLUDE_PATTERNS = [
  /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)(\?|$)/i,
  /report|analytics|tracking|cherami|appreports/i,
  /google-analytics|facebook\.com|doubleclick|adservice|pagead/i,
  /fonts\.(googleapis|gstatic)/i,
  /cloudflare/i,
];

function isMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    if (EXCLUDE_PATTERNS.some(p => p.test(url))) return false;
    return MEDIA_EXTENSIONS.test(url) || MEDIA_PATHS.test(url);
  } catch {
    return false;
  }
}

function classifyUrl(url) {
  if (!url) return 'Stream';
  const lower = url.toLowerCase();
  if (lower.includes('.m3u8')) return 'M3U8 (HLS)';
  if (lower.includes('.mpd')) return 'MPD (DASH)';
  if (lower.includes('.mp4')) return 'MP4';
  if (lower.includes('.webm')) return 'WEBM';
  if (lower.includes('.ts')) return 'TS (Segment)';
  if (lower.includes('.m4s')) return 'M4S (Segment)';
  if (lower.includes('.mkv')) return 'MKV';
  return 'Stream';
}

// ─── Iframe embed player domains ──────────────────────────────────────────────
const PLAYER_DOMAINS = [
  'vidmoly', 'streamtape', 'doodstream', 'mixdrop', 'vidsrc',
  'filemoon', 'wolfstream', 'streamwish', 'embedrise', 'closeload',
  'vidhide', 'upstream', 'vidcloud', 'rabbitstream', 'vidplay',
  'netu', 'fembed', 'streamsb', 'sbplay', 'alions', 'chillx',
  'voe.sx', 'vtbe', 'turboplay', 'playerjs', 'okru', 'ok.ru',
  'dailymotion', 'vimeo', 'youtube', 'youtu.be', 'embed', 'player',
  'fasturl', 'rapid', 'hdstream', 'superembed'
];

function isPlayerUrl(url) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return PLAYER_DOMAINS.some(d => hostname.includes(d));
  } catch { return false; }
}

// ─── Helper: Setup a page with stealth and PASSIVE network listening ──────────
// IMPORTANT: We do NOT use setRequestInterception(true) because it causes
// Cloudflare/WAF-protected sites to detect CDP overhead and return blank pages.
// Instead, we passively listen to response events which doesn't interfere.
async function setupPage(browser, refererUrl = null) {
  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1280, height: 800 });

  if (refererUrl) {
    await page.setExtraHTTPHeaders({ 'Referer': refererUrl });
  }

  // Passive network capture — only listens, never intercepts
  const capturedUrls = new Set();

  page.on('response', (response) => {
    try {
      const respUrl = response.url();
      if (isMediaUrl(respUrl)) {
        capturedUrls.add(respUrl);
      }
    } catch {}
  });

  // Also listen to requests passively via CDP (no interception)
  const cdpSession = await page.target().createCDPSession();
  await cdpSession.send('Network.enable');
  cdpSession.on('Network.requestWillBeSent', (params) => {
    try {
      if (isMediaUrl(params.request.url)) {
        capturedUrls.add(params.request.url);
      }
    } catch {}
  });

  return { page, capturedUrls };
}

// ─── Helper: Extract DOM data from a loaded page ──────────────────────────────
async function extractFromDOM(page, baseUrl) {
  return await page.evaluate((base) => {
    const result = {
      iframes: [],
      videos: [],
      scriptStreams: [],
      cloudflareDetected: false,
      title: document.title || 'Başlıksız Sayfa'
    };

    // Cloudflare detection
    const html = document.documentElement.innerHTML || '';
    result.cloudflareDetected = html.includes('cloudflare') ||
      html.includes('cf-browser-verification') ||
      html.includes('Just a moment');

    // 1. All iframes (src + data-src + data-lazy-src)
    document.querySelectorAll('iframe').forEach((el, i) => {
      const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-lazy-src');
      if (src && src.trim() && src.trim() !== 'about:blank') {
        const name = el.getAttribute('name') || el.getAttribute('id') || el.getAttribute('title') || `Oynatıcı ${i + 1}`;
        result.iframes.push({ name: name.trim(), url: src.trim() });
      }
    });

    // 2. HTML5 video elements
    document.querySelectorAll('video').forEach((videoEl) => {
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

    // 3. Regex scan scripts for stream URLs
    const streamRegex = /https?:\/\/[^\s"'`<>]+?\.(m3u8|mp4|webm|mpd)(\?[^\s"'`<>]+)?/gi;
    const jsConfigRegex = /(?:file|src|source|url|stream|video_url|video_link|hls_url|dash_url)\s*[:=]\s*["'`]([^"'`]+\.(?:m3u8|mp4|webm|mpd)[^"'`]*)/gi;

    document.querySelectorAll('script').forEach(scriptEl => {
      const content = scriptEl.textContent || scriptEl.innerHTML || '';
      if (content.length > 0) {
        // Direct URL matches
        let match;
        streamRegex.lastIndex = 0;
        while ((match = streamRegex.exec(content)) !== null) {
          result.scriptStreams.push(match[0].replace(/\\\//g, '/').replace(/\\\\/g, ''));
        }
        // Config object matches
        jsConfigRegex.lastIndex = 0;
        while ((match = jsConfigRegex.exec(content)) !== null) {
          result.scriptStreams.push(match[1].replace(/\\\//g, '/').replace(/\\\\/g, ''));
        }
      }
    });

    // 4. Also scan full HTML
    streamRegex.lastIndex = 0;
    let m;
    while ((m = streamRegex.exec(html)) !== null) {
      result.scriptStreams.push(m[0].replace(/\\\//g, '/').replace(/\\\\/g, ''));
    }

    return result;
  }, baseUrl);
}

// ─── Helper: Navigate safely (never throws — returns success boolean) ─────────
async function safeNavigate(page, url, timeout = 30000) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    return true;
  } catch (e) {
    console.log(`  ⚠️ Navigasyon uyarısı: ${e.message.substring(0, 120)}`);
    // Even if navigation "failed" (timeout, partial load), page may have content
    return false;
  }
}

// ─── Helper: Inject JS hooks to intercept dynamically-constructed stream URLs ─
async function injectStreamInterceptors(page) {
  await page.evaluateOnNewDocument(() => {
    window.__capturedStreams__ = [];
    const STREAM_RE = /https?:\/\/[^\s"'`<>]+?\.(m3u8|mp4|webm|mpd)(\?[^\s"'`<>]*)?/gi;

    function captureFromString(str) {
      if (!str || typeof str !== 'string' || str.length > 500000) return;
      STREAM_RE.lastIndex = 0;
      let m;
      while ((m = STREAM_RE.exec(str)) !== null) {
        const url = m[0].replace(/\\\//g, '/');
        if (!window.__capturedStreams__.includes(url)) {
          window.__capturedStreams__.push(url);
        }
      }
    }

    // Hook XMLHttpRequest.open to catch AJAX stream fetches
    const origXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      captureFromString(url);
      return origXHROpen.apply(this, arguments);
    };

    // Hook fetch() to catch fetch-based stream requests
    const origFetch = window.fetch;
    window.fetch = function(input) {
      if (typeof input === 'string') captureFromString(input);
      else if (input && input.url) captureFromString(input.url);
      return origFetch.apply(this, arguments);
    };

    // Hook createElement('source') to catch dynamically created video sources
    const origCreateElement = document.createElement.bind(document);
    document.createElement = function(tag) {
      const el = origCreateElement(tag);
      if (tag.toLowerCase() === 'source' || tag.toLowerCase() === 'video') {
        const origSetAttr = el.setAttribute.bind(el);
        el.setAttribute = function(name, value) {
          if (name === 'src') captureFromString(value);
          return origSetAttr(name, value);
        };
        // Also intercept .src property
        try {
          const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src') ||
                       Object.getOwnPropertyDescriptor(HTMLSourceElement.prototype, 'src');
          if (desc && desc.set) {
            Object.defineProperty(el, 'src', {
              set(v) { captureFromString(v); desc.set.call(this, v); },
              get() { return desc.get ? desc.get.call(this) : ''; },
              configurable: true
            });
          }
        } catch {}
      }
      return el;
    };
  });
}

// ─── Deep scan: open an iframe/embed page and extract its real streams ────────
async function deepScanEmbed(browser, embedUrl, refererUrl) {
  console.log(`  ↳ Derin tarama: ${embedUrl.substring(0, 80)}...`);
  const deepResult = { networkStreams: [], scriptStreams: [], videos: [] };

  let deepPage = null;
  try {
    const setup = await setupPage(browser, refererUrl);
    deepPage = setup.page;
    const capturedUrls = setup.capturedUrls;

    // Inject stream interceptors BEFORE navigation so they catch everything
    await injectStreamInterceptors(deepPage);

    const navSuccess = await safeNavigate(deepPage, embedUrl, 25000);

    // 1. EXTRACT DOM IMMEDIATELY (before WAF detects automation)
    let embedDOM = { scriptStreams: [], videos: [] };
    try {
      embedDOM = await extractFromDOM(deepPage, embedUrl);
      
      embedDOM.scriptStreams.forEach(url => {
        const resolved = resolveUrl(embedUrl, url);
        if (resolved) deepResult.scriptStreams.push(resolved);
      });

      embedDOM.videos.forEach(v => {
        const resolved = resolveUrl(embedUrl, v.url);
        if (resolved) deepResult.videos.push({ type: v.type, url: resolved });
      });
    } catch (e) {
      console.log('  ⚠️ DOM extraction warning:', e.message.substring(0, 80));
    }

    // 2. Click play button (multiple attempts with delay)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const clicked = await deepPage.evaluate(() => {
          const selectors = [
            'button[class*="play"]', '.play-btn', '.vjs-big-play-button',
            '.jw-icon-display', '#play', '.play', '[data-plyr="play"]',
            'button[aria-label*="Play"]', 'button[title*="Play"]',
            '.btn-play', '.icon-play', '.plyr__control--overlaid',
            '.vjs-play-control', 'video', '.jw-video', '.vjs-tech',
            '.player-poster', '[class*="overlay"]'
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) { el.click(); return sel; }
          }
          return null;
        });
        if (clicked) console.log(`  ▶️ Play tıklandı: ${clicked}`);
      } catch { /* ignore */ }
      
      if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
    }

    // 3. Wait for network streams to appear (5 seconds)
    await new Promise(r => setTimeout(r, 5000));

    // 4. Collect JS-intercepted streams
    try {
      const jsIntercepted = await deepPage.evaluate(() => window.__capturedStreams__ || []);
      jsIntercepted.forEach(url => {
        const resolved = resolveUrl(embedUrl, url);
        if (resolved && isMediaUrl(resolved)) deepResult.scriptStreams.push(resolved);
        else if (resolved) deepResult.scriptStreams.push(resolved);
      });
    } catch {}

    // 5. Collect network captured streams
    capturedUrls.forEach(url => {
      deepResult.networkStreams.push(url);
    });

    // 6. Final DOM re-scan (page may have loaded new content after play)
    try {
      const finalDOM = await extractFromDOM(deepPage, embedUrl);
      finalDOM.scriptStreams.forEach(url => {
        const resolved = resolveUrl(embedUrl, url);
        if (resolved && !deepResult.scriptStreams.includes(resolved)) {
          deepResult.scriptStreams.push(resolved);
        }
      });
      finalDOM.videos.forEach(v => {
        const resolved = resolveUrl(embedUrl, v.url);
        if (resolved && !deepResult.videos.find(x => x.url === resolved)) {
          deepResult.videos.push({ type: v.type, url: resolved });
        }
      });
    } catch {}

    const totalDeep = deepResult.networkStreams.length + deepResult.scriptStreams.length + deepResult.videos.length;
    console.log(`  → Derin tarama: ${deepResult.networkStreams.length} ağ stream, ${deepResult.scriptStreams.length} script stream, ${deepResult.videos.length} video bulundu`);

    await deepPage.close();
  } catch (err) {
    console.error(`  ✗ Derin tarama hatası (${embedUrl.substring(0, 50)}): ${err.message}`);
    if (deepPage) try { await deepPage.close(); } catch {}
  }

  return deepResult;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXTRACTION ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/api/extract', async (req, res) => {
  const { url } = req.body;

  if (!url) return res.status(400).json({ error: 'Lütfen bir URL girin.' });

  let targetUrl;
  try {
    targetUrl = new URL(url).href;
  } catch {
    return res.status(400).json({ error: 'Geçersiz URL. http:// veya https:// ile başlamalı.' });
  }

  let browser = null;
  try {
    console.log(`\n🔍 Analiz başlatıldı: ${targetUrl}`);

    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,800',
        '--single-process', // Required for Docker/Render
      ],
      ignoreHTTPSErrors: true,
    };
    // Use system Chromium if PUPPETEER_EXECUTABLE_PATH is set (Docker/Render)
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    browser = await puppeteer.launch(launchOptions);

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 1: Scan the main page
    // ══════════════════════════════════════════════════════════════════════════
    console.log('📄 Faz 1: Ana sayfa taranıyor...');
    
    let phase1Referer = null;
    try {
      const parsed = new URL(targetUrl);
      if (parsed.hostname.includes('closeload.filmmakinesi.to')) {
        phase1Referer = 'https://filmmakinesi.to/';
      } else if (parsed.hostname.includes('closeload')) {
        phase1Referer = 'https://closeload.to/';
      } else if (parsed.hostname.includes('vidmoly')) {
        phase1Referer = 'https://vidmoly.to/';
      }
    } catch {}

    const { page: mainPage, capturedUrls: mainNetworkUrls } = await setupPage(browser, phase1Referer);

    // Inject interceptors on main page too
    await injectStreamInterceptors(mainPage);

    await safeNavigate(mainPage, targetUrl);

    // Wait extra for JS-rendered content (iframes often loaded via AJAX)
    try {
      await mainPage.waitForSelector('iframe', { timeout: 8000 });
    } catch {
      // No iframe appeared in 8s — try clicking common "watch" buttons
      try {
        await mainPage.evaluate(() => {
          const watchBtns = document.querySelectorAll(
            'a[href*="izle"], button[class*="watch"], .play-btn, .btn-watch, ' +
            '[onclick*="iframe"], [data-url], [data-src], .movie-player-btn, ' +
            'a[class*="play"], [id*="player"], .fragman-btn, a[href="#izle"]'
          );
          if (watchBtns.length > 0) watchBtns[0].click();
        });
        // Wait for iframe to appear after click
        await mainPage.waitForSelector('iframe', { timeout: 5000 }).catch(() => {});
      } catch {}
    }

    let mainDOM = { iframes: [], videos: [], scriptStreams: [], title: 'Başlıksız Sayfa', cloudflareDetected: false };
    try {
      mainDOM = await extractFromDOM(mainPage, targetUrl);
    } catch (e) {
      console.log('  ⚠️ Ana sayfa DOM extraction hatası (yönlenmiş olabilir):', e.message);
    }

    // If no iframes found, also search HTML source for hidden embed URLs
    if (mainDOM.iframes.length === 0) {
      try {
        const hiddenEmbeds = await mainPage.evaluate(() => {
          const results = [];
          const html = document.documentElement.innerHTML;
          
          // Search for embed URLs in onclick, data-*, or JS variables
          const embedPatterns = [
            /(?:src|url|embed|link|source)\s*[:=]\s*["'`](https?:\/\/[^"'`]+?\/(?:embed|vod|e|v|watch|play)[^"'`]*)/gi,
            /iframe[^>]*src\s*=\s*["']([^"']+)/gi,
            /data-(?:src|url|embed|link)\s*=\s*["']([^"']+)/gi,
          ];
          
          for (const pattern of embedPatterns) {
            pattern.lastIndex = 0;
            let m;
            while ((m = pattern.exec(html)) !== null) {
              const url = m[1].replace(/\\\//g, '/');
              if (url.startsWith('http') && !url.includes('google') && !url.includes('facebook')) {
                results.push(url);
              }
            }
          }
          return [...new Set(results)];
        });

        hiddenEmbeds.forEach((url, i) => {
          if (!mainDOM.iframes.find(f => f.url === url)) {
            mainDOM.iframes.push({ name: `Gizli Embed ${i + 1}`, url });
          }
        });
      } catch {}
    }

    // Collect JS-intercepted streams from main page
    try {
      const mainJsStreams = await mainPage.evaluate(() => window.__capturedStreams__ || []);
      mainJsStreams.forEach(url => {
        if (!mainDOM.scriptStreams.includes(url)) {
          mainDOM.scriptStreams.push(url);
        }
      });
    } catch {}
    
    // Debug logging when 0 results found
    if (mainDOM.iframes.length === 0 && mainDOM.videos.length === 0 && mainDOM.scriptStreams.length === 0) {
      try {
        const pageInfo = await mainPage.evaluate(() => {
          return {
            title: document.title || 'Başlıksız Sayfa',
            bodyTextSnippet: document.body?.innerText?.substring(0, 500) || 'Boş Body',
            htmlLength: document.documentElement.innerHTML.length
          };
        });
        console.log(`  [DEBUG] Başlık: "${pageInfo.title}", HTML Boyutu: ${pageInfo.htmlLength} karakter`);
        console.log(`  [DEBUG] İçerik Önizleme:\n${pageInfo.bodyTextSnippet}\n---`);
      } catch (err) {
        console.log(`  [DEBUG] Sayfa detayı alınamadı (yönlendi): ${err.message}`);
      }
    }

    // Collect network streams passive list from Phase 1
    const phase1NetworkUrls = [];
    mainNetworkUrls.forEach(url => {
      phase1NetworkUrls.push(url);
    });

    await mainPage.close();

    console.log(`  → ${mainDOM.iframes.length} iframe, ${mainDOM.videos.length} video, ${mainDOM.scriptStreams.length} script stream bulundu`);

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 2: Deep-scan each iframe/embed found in Phase 1
    // ══════════════════════════════════════════════════════════════════════════
    const resolvedIframes = [];
    const seenIframeUrls = new Set();
    mainDOM.iframes.forEach(item => {
      const resolved = resolveUrl(targetUrl, item.url);
      if (resolved && !seenIframeUrls.has(resolved)) {
        seenIframeUrls.add(resolved);
        resolvedIframes.push({ name: item.name, url: resolved });
      }
    });

    // Deep scan results aggregation
    const allDeepNetworkStreams = [];
    const allDeepScriptStreams = [];
    const allDeepVideos = [];

    if (resolvedIframes.length > 0) {
      console.log(`🔎 Faz 2: ${resolvedIframes.length} embed oynatıcı derin taranıyor...`);

      // Deep scan up to 5 iframes in parallel (reasonable limit)
      const deepScanPromises = resolvedIframes.slice(0, 5).map(iframe =>
        deepScanEmbed(browser, iframe.url, targetUrl)
      );

      const deepResults = await Promise.all(deepScanPromises);

      deepResults.forEach(dr => {
        allDeepNetworkStreams.push(...dr.networkStreams);
        allDeepScriptStreams.push(...dr.scriptStreams);
        allDeepVideos.push(...dr.videos);
      });

      console.log(`  → Derin tarama: ${allDeepNetworkStreams.length} ağ stream, ${allDeepScriptStreams.length} script stream, ${allDeepVideos.length} video bulundu`);
    }

    await browser.close();
    browser = null;

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 3: Post-process, deduplicate, and build final result
    // ══════════════════════════════════════════════════════════════════════════
    const result = {
      iframes: resolvedIframes,
      videos: [],
      scriptStreams: [],
      networkStreams: [],
      deepStreams: [],   // NEW: streams found by deep-scanning embed pages
      info: {
        title: mainDOM.title,
        cloudflareDetected: mainDOM.cloudflareDetected,
      }
    };

    const seenUrls = new Set();

    // Main page videos
    mainDOM.videos.forEach(v => {
      const resolved = resolveUrl(targetUrl, v.url);
      if (resolved && !seenUrls.has(resolved)) {
        seenUrls.add(resolved);
        result.videos.push({ type: v.type, url: resolved });
      }
    });

    // Main page script streams
    mainDOM.scriptStreams.forEach(raw => {
      const resolved = resolveUrl(targetUrl, raw);
      if (resolved && !seenUrls.has(resolved)) {
        seenUrls.add(resolved);
        result.scriptStreams.push({ format: classifyUrl(resolved), url: resolved });
      }
    });

    // Main page network streams
    mainNetworkUrls.forEach(url => {
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        result.networkStreams.push({ format: classifyUrl(url), url });
      }
    });

    // ★ Deep scan results (the most valuable data!)
    // Deep network streams
    allDeepNetworkStreams.forEach(url => {
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        result.deepStreams.push({ format: classifyUrl(url), url, source: 'Ağ Trafiği (Derin)' });
      }
    });

    // Deep script streams
    allDeepScriptStreams.forEach(url => {
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        result.deepStreams.push({ format: classifyUrl(url), url, source: 'Script (Derin)' });
      }
    });

    // Deep videos
    allDeepVideos.forEach(v => {
      if (!seenUrls.has(v.url)) {
        seenUrls.add(v.url);
        result.deepStreams.push({ format: classifyUrl(v.url), url: v.url, source: v.type });
      }
    });

    const total = result.iframes.length + result.videos.length +
      result.scriptStreams.length + result.networkStreams.length + result.deepStreams.length;
    console.log(`✅ Analiz tamamlandı: toplam ${total} bağlantı bulundu\n`);

    return res.json(result);

  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch {}
    }

    console.error('❌ Extraction error:', error.message);

    let status = 500;
    let errorMessage = 'Sayfa taranırken bir hata oluştu: ' + error.message;

    if (error.message.includes('net::ERR_NAME_NOT_RESOLVED') || error.message.includes('ENOTFOUND')) {
      status = 404;
      errorMessage = 'Hedef sunucu bulunamadı. URL adresini kontrol edin.';
    } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      status = 408;
      errorMessage = 'Sayfa yüklenirken zaman aşımı oluştu. Site çok yavaş yanıt veriyor olabilir.';
    }

    return res.status(status).json({ error: errorMessage });
  }
});

// ─── Test page ────────────────────────────────────────────────────────────────
app.get('/test-page', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><title>Test Film Sayfası</title></head>
<body>
  <h1>Test Film (2026)</h1>
  <iframe src="https://player.vidmoly.to/embed-test12345.html" name="Vidmoly Player" width="100%" height="450"></iframe>
  <video controls src="/media/movie.mp4"></video>
  <video controls>
    <source src="https://example-cdn.com/hls/movie.m3u8" type="application/x-mpegURL">
    <source src="https://example-cdn.com/dash/movie.mpd" type="application/dash+xml">
  </video>
  <script>
    const playerConfig = {
      streamUrl: "https://mockcdn.com/streams/hd.m3u8?auth=tokenabc123",
      backup: "https://mockcdn.com/streams/backup.mp4"
    };
  </script>
</body>
</html>`);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const os = require('os');

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (127.0.0.1) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

app.listen(PORT, () => {
  const localIp = getLocalIpAddress();
  console.log(`\n==================================================`);
  console.log(`✅ Server çalışıyor: http://localhost:${PORT}`);
  if (localIp !== '127.0.0.1') {
    console.log(`📱 Mobilden bağlanmak için (Aynı Wi-Fi):`);
    console.log(`   👉 http://${localIp}:${PORT}`);
  }
  console.log(`==================================================\n`);
});
