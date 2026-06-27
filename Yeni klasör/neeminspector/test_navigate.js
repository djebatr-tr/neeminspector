const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  
  // Set Referer!
  await page.setExtraHTTPHeaders({
    'Referer': 'https://filmmakinesi.to/'
  });

  try {
    console.log('Navigating to Closeload...');
    const response = await page.goto('https://closeload.filmmakinesi.to/video/embed/22YxKHDVoyZ/?imdb_id=tt33296751', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('Response Status:', response ? response.status() : 'No response');
    const html = await page.content();
    console.log('HTML Length:', html.length);
    console.log('HTML Snippet:', html.substring(0, 1000));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

run();
