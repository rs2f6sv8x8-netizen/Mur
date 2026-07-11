// Render a list of book xhtml pages to PNG via headless Chromium.
// Usage: node render_pages.cjs <manifest.json>
// manifest: [{ "page": "/abs/path/pageNNN.xhtml", "out": "/abs/out.png" }, ...]
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 723, height: 1020 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  let done = 0;
  for (const item of manifest) {
    const url = 'file://' + encodeURI(item.page);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: item.out });
      done++;
    } catch (e) {
      console.log('FAIL', item.page, e.message);
    }
  }
  console.log('rendered', done, 'of', manifest.length);
  await browser.close();
})();
