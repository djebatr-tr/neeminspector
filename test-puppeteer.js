const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
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
    ],
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1280, height: 800 });

  // Set referer like the real server does for embed pages
  const refererUrl = 'https://www.fullhdfilmizlesene.life/';
  await page.setExtraHTTPHeaders({ 'Referer': refererUrl });

  // Enable CDP network passive monitoring (like setupPage does)
  const capturedUrls = new Set();
  const cdpSession = await page.target().createCDPSession();
  await cdpSession.send('Network.enable');
  cdpSession.on('Network.requestWillBeSent', (params) => {
    const url = params.request.url;
    if (/\.(m3u8|mp4|webm|mpd|ts|m4s)(\?|$|#)/i.test(url)) {
      capturedUrls.add(url);
      console.log(`🎯 CDP Captured: ${url.substring(0, 100)}`);
    }
  });

  page.on('response', response => {
    const url = response.url();
    if (/\.(m3u8|mp4|webm|mpd|ts|m4s)(\?|$|#)/i.test(url)) {
      console.log(`📥 Response stream: [${response.status()}] ${url.substring(0, 100)}`);
      capturedUrls.add(url);
    }
  });

  page.on('requestfailed', request => {
    console.log(`❌ Request FAILED: ${request.url().substring(0, 80)} → ${request.failure()?.errorText}`);
  });

  try {
    console.log("1. Navigating to rapidvid.net embed (with Referer + CDP)...");
    await page.goto('https://rapidvid.net/vod/v1x5e98ee65', {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    });
    console.log("2. Navigation OK!");
    console.log(`   Current URL: ${page.url()}`);
    
    const htmlLen = await page.evaluate(() => document.documentElement.innerHTML.length);
    console.log(`   HTML length: ${htmlLen}`);

    // Try clicking play
    console.log("3. Trying to click play button...");
    await page.evaluate(() => {
      const selectors = [
        'button[class*="play"]', '.play-btn', '.vjs-big-play-button',
        '.jw-icon-display', '#play', '.play', '[data-plyr="play"]',
        'button[aria-label*="Play"]', 'button[title*="Play"]',
        '.btn-play', '.icon-play', '.plyr__control--overlaid',
        '.vjs-play-control', 'video'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { el.click(); console.log('Clicked:', sel); break; }
      }
    });

    // Wait for streams
    console.log("4. Waiting 5 seconds for network streams...");
    await new Promise(r => setTimeout(r, 5000));

    console.log(`\n5. Total captured stream URLs: ${capturedUrls.size}`);
    capturedUrls.forEach(u => console.log(`   → ${u}`));

    // Check scripts for stream URLs
    const scriptStreams = await page.evaluate(() => {
      const regex = /https?:\/\/[^\s"'`<>]+?\.(m3u8|mp4|webm|mpd)(\?[^\s"'`<>]+)?/gi;
      const html = document.documentElement.innerHTML;
      return [...new Set((html.match(regex) || []))];
    });
    console.log(`\n6. Script-embedded streams: ${scriptStreams.length}`);
    scriptStreams.forEach(s => console.log(`   → ${s}`));

  } catch (err) {
    console.error("Navigation FAILED:", err.message);
  } finally {
    await browser.close();
  }
})();
