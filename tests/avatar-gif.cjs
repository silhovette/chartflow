const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const gif = 'R0lGODlhIAAgAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAGQAAACwAAAAAIAAgAAAINQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJUmRAACH5BAEZAAEALAAAAAAgACAAgQAA/wAAAAAAAAAAAAg1AAEIHEiwoMGDCBMqXMiwocOHECNKnEixosWLGDNq3Mixo8ePIEOKHEmypMmTKFOqXMlSZEAAOw==';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const open = async () => {
      await page.goto('http://127.0.0.1:4173');
      await page.waitForFunction(() => CF.guide.dialog?.open);
      await page.evaluate(() => CF.guide.close());
      await page.waitForFunction(() => !CF.guide.busy);
      await page.locator('.user-chip').click();
    };
    const animated = async selector => {
      const el = page.locator(selector);
      const first = await el.screenshot();
      let changed = false;
      for (let i = 0; i < 6 && !changed; i++) {
        await page.waitForTimeout(140);
        changed = !first.equals(await el.screenshot());
      }
      assert.ok(changed, selector + ' must visibly animate');
    };
    await open();
    await page.getByRole('button', { name: 'Avatar options', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-account="avatar"]').click();
    await (await chooser).setFiles({ name: 'animated.gif', mimeType: 'image/gif', buffer: Buffer.from(gif, 'base64') });
    await page.waitForFunction(() => !document.querySelector('#avatar-upload'));
    const source = 'data:image/gif;base64,' + gif;
    assert.equal(await page.locator('#user-avatar img').getAttribute('src'), source);
    await animated('#user-avatar img');
    await animated('.profile-monogram img');
    assert.equal(await page.evaluate(async () => {
      const image = document.querySelector('#user-avatar img');
      await CF.progress.save();
      return image === document.querySelector('#user-avatar img');
    }), true);
    await open();
    assert.equal(await page.locator('#user-avatar img').getAttribute('src'), source);
    await animated('#user-avatar img');
    await page.evaluate(async () => {
      const data = CF.account.parse(await CF.storage.bundle());
      await CF.storage.replace(data, data.profile.id);
      await CF.workspace.activate(data.profile.id);
      await CF.account.show();
    });
    assert.equal(await page.locator('#user-avatar img').getAttribute('src'), source);
    await animated('.profile-monogram img');
    assert.equal(await page.locator('#user-avatar').evaluate(e => getComputedStyle(e).borderWidth), '0px');
    await page.getByRole('button', { name: 'Avatar options', exact: true }).click();
    await page.locator('[data-account="reset-avatar"]').click();
    await page.waitForFunction(() => !CF.progress.profile.avatar);
    assert.equal(await page.locator('#user-avatar img').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: visibly animated GIFs in both avatars, original bytes, progress save continuity, reload, portable import, borderless display and reset.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
