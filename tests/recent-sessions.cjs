const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173');
    await page.waitForFunction(() => CF.guide.dialog?.open);
    await page.evaluate(() => CF.guide.close());
    await page.waitForFunction(() => !CF.guide.busy);
    await page.evaluate(async () => {
      const chart = CF.app.charts[0];
      CF.progress.profile.history = Array.from({length: 25}, (_, i) => ({
        id: `session-${i}`, chartId: i % 2 ? 'deleted-chart' : chart.id,
        name: chart.name, grade: 'S', keyCount: 4, accuracy: 98,
        combo: 80, score: 10000, at: Date.now() - i * 60000,
      }));
      await CF.account.show('overview');
    });
    assert.equal(await page.locator('.session-row').count(), 10);
    assert.equal(await page.locator('.session-deleted').count(), 5);
    assert.equal(await page.getByText('Up to latest 200', {exact:true}).count(), 1);
    await page.locator('[data-account="more-sessions"]').click();
    assert.equal(await page.locator('.session-row').count(), 20);
    assert.equal(await page.locator('.session-deleted').count(), 10);
    assert.ok(await page.locator('.session-row').nth(10).evaluate(e => e.getAnimations().length > 0));
    await page.locator('[data-account="more-sessions"]').click();
    assert.equal(await page.locator('.session-row').count(), 25);
    assert.equal(await page.locator('[data-account="more-sessions"]').count(), 0);
    await page.evaluate(async () => {
      const id = CF.app.charts[0].id;
      await CF.storage.remove(id);
      CF.app.charts = await CF.storage.all();
      await CF.account.show('overview');
    });
    assert.equal(await page.locator('.session-row').count(), 10);
    assert.equal(await page.locator('.session-deleted').count(), 10);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('[data-account="more-sessions"]').click();
    assert.equal(await page.locator('.session-row').nth(10).evaluate(e => e.getAnimations().length), 0);
    await page.evaluate(async () => { CF.progress.profile.history = []; await CF.account.show('overview'); });
    assert.equal(await page.locator('.session-row').count(), 0);
    assert.equal(await page.locator('[data-account="more-sessions"]').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: deleted chart IDs (including duplicate names), 10/20/25 rows, incremental animation, reduced motion, reopen and empty history.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
