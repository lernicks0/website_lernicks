const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const teachers = ['chi', 'mat', 'eng', 'sci', 'com', 'tec'].map((id, i) => ({ id, name: ['语文老师', '数学老师', '英语老师', '科学老师', '社会老师', '副科老师'][i], role: 'teacher', isAdmin: true, hasPassword: true }));
function contrast(a, b) {
  function luminance(c) { return c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0); }
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const site of ['cla-site', 'sco-site', 'goal-site', 'news-site']) {
      const html = fs.readFileSync(path.join(root, site, 'index.html'), 'utf8');
      const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n') + (site === 'news-site' ? fs.readFileSync(path.join(root, site, 'style.css'), 'utf8') : '');
      const page = await browser.newPage();
      let submitted;
      await page.route('http://widget.test/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<html><head><style>' + styles + '</style></head><body><button data-class-account>账号</button></body></html>' });
        if (url.pathname.endsWith('/password')) submitted = route.request().postDataJSON();
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, account: teachers[5], accounts: teachers }) });
      });
      await page.goto('http://widget.test/');
      await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
      await page.addScriptTag({ path: path.join(root, 'class-auth/widget.js') });
      await page.evaluate(() => ClassAccount.ready);
      await page.locator('[data-class-account]').click();
      await page.locator('#caManageButton').click();
      await page.locator('#caManageId').waitFor();
      assert.deepEqual(await page.locator('#caManageId option').evaluateAll(nodes => nodes.map(n => n.value)), teachers.map(t => t.id));
      for (const t of teachers) assert((await page.locator('option[value="' + t.id + '"]').textContent()).includes(t.name));
      for (const theme of ['light', 'dark', 'light']) {
        await page.evaluate(theme => { document.documentElement.classList.toggle('astra', theme === 'light'); document.documentElement.style.colorScheme = theme; }, theme);
        await page.waitForFunction(theme => document.querySelector('#classAccountRoot').dataset.theme === theme, theme);
        for (const width of [1280, 375]) {
          await page.setViewportSize({ width, height: 800 });
          const colors = await page.evaluate(() => {
            const selectors = ['.ca-card', '.ca-field', '.ca-field option', '.ca-note', '.ca-status.on', '.ca-button.primary'];
            return selectors.map(selector => { const e = document.querySelector('#classAccountRoot ' + selector), s = getComputedStyle(e); return { selector, color: s.color, bg: s.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.querySelector('.ca-card')).backgroundColor : s.backgroundColor, scheme: s.colorScheme }; });
          });
          for (const c of colors) { assert(contrast(c.color, c.bg) >= 4.5, site + ' ' + theme + ' ' + c.selector + ': ' + JSON.stringify(c)); assert.equal(c.scheme, theme); }
          assert(await page.locator('.ca-card').evaluate(e => e.scrollWidth <= e.clientWidth), site + ' overflow');
          if (site === 'cla-site' && width === 375) {
            fs.mkdirSync(path.join(root, 'test-fixtures/widget-ui'), { recursive: true });
            await page.screenshot({ path: path.join(root, 'test-fixtures/widget-ui/' + theme + '.png') });
          }
        }
      }
      await page.selectOption('#caManageId', 'mat');
      await page.fill('#caManagePassword', 'test-only-password');
      await page.locator('#caSetPassword').click();
      await page.waitForFunction(() => document.querySelector('#caManageStatus').classList.contains('ca-success'));
      assert.equal(submitted.id, 'mat');
      const success = await page.locator('#caManageStatus').evaluate(e => [getComputedStyle(e).color, getComputedStyle(e.closest('.ca-card')).backgroundColor]);
      assert(contrast(...success) >= 4.5);
      await page.close();
      console.log(site + ': themes, mobile layout, teacher labels and selection PASS');
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
