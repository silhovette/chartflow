const { chromium } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.BROWSER_CHANNEL || "msedge",
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:4173");
    await page.locator('#guide [data-guide="close"]').click();
    await page.waitForFunction(() => !CF.guide.dialog.open);

    assert.equal(await page.locator(".brand .version").count(), 0);
    await page.locator('[data-action="new"]').first().click();
    assert.equal(
      await page.locator(".setup-layout .flow-line").evaluate((line) => getComputedStyle(line, "::after").display),
      "none",
    );
    await page.locator('[data-keys="7"]').click();
    assert.deepEqual(
      await page.locator(".test-key").allTextContents(),
      ["S", "D", "F", "J", "K", "L", ";"],
    );
    await page.locator('[data-action="settings"]').click();
    assert.equal(await page.locator("#dialog h2").innerText(), "Settings");
    assert.equal(await page.locator("#dialog").getAttribute("data-animated"), "true");
    assert.equal(
      await page.locator("#dialog").evaluate((dialog) => getComputedStyle(dialog, "::backdrop").animationName),
      "modal-backdrop-in",
    );
    const slider = page.locator('#dialog [name="volume"]');
    const sliderBox = await slider.boundingBox();
    await page.mouse.click(sliderBox.x + sliderBox.width - 1, sliderBox.y + sliderBox.height / 2);
    assert.equal(await slider.inputValue(), "1");
    await slider.evaluate((input) => { input.value = "0.25"; });
    await page.evaluate(() => {
      const audio = CF.app.audio;
      window.previewCalls = [];
      window.previewOriginal = { tone: audio.tone, unlock: audio.unlock, enabled: audio.enabled };
      audio.enabled = false;
      audio.unlock = () => window.previewCalls.push({ unlocked: true });
      audio.tone = (...args) => window.previewCalls.push({ args, volume: audio.volume, enabled: audio.enabled });
    });
    await page.locator(".settings-volume-test").click();
    const preview = await page.evaluate(() => {
      const audio = CF.app.audio;
      const result = { calls: window.previewCalls, volume: audio.volume, enabled: audio.enabled, savedVolume: CF.app.settings.volume };
      audio.tone = window.previewOriginal.tone;
      audio.unlock = window.previewOriginal.unlock;
      audio.enabled = window.previewOriginal.enabled;
      return result;
    });
    assert.deepEqual(preview.calls, [
      { unlocked: true },
      { args: [460, undefined, 0.045, 0.6], volume: 0.25, enabled: true },
    ]);
    assert.equal(preview.volume, preview.savedVolume);
    assert.equal(await page.locator("#dialog").getAttribute("open"), "");
    for (const [width, height] of [[1440, 900], [1280, 720], [390, 844], [360, 568]]) {
      await page.setViewportSize({ width, height });
      const layout = await page.locator("#dialog").evaluate((dialog) => {
        const rect = dialog.getBoundingClientRect();
        return {
          top: rect.top, bottom: rect.bottom,
          scrollHeight: dialog.scrollHeight, clientHeight: dialog.clientHeight,
          scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth,
        };
      });
      assert.ok(layout.top >= -1 && layout.bottom <= height + 1, JSON.stringify(layout));
      assert.ok(layout.scrollHeight <= layout.clientHeight, JSON.stringify(layout));
      assert.ok(layout.scrollWidth <= layout.clientWidth, JSON.stringify(layout));
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.mouse.click(5, 5);
    assert.equal(await page.locator("#dialog").getAttribute("data-state"), "closing");
    await page.waitForFunction(() => !document.querySelector("#dialog").open);

    await page.locator('[data-action="settings"]').click();
    await page.locator('#dialog [value="cancel"]').click();
    await page.waitForFunction(() => !document.querySelector("#dialog").open);
    await page.locator('[data-action="library"]').first().click();
    await page.locator('.chart-row').first().click();
    await page.locator('[data-action="delete"]').click();
    assert.equal(await page.locator("#dialog h2").innerText(), "Delete this chart?");
    assert.equal(await page.locator("#dialog").getAttribute("data-animated"), "true");
    await page.locator('#dialog [value="cancel"]').click();
    assert.equal(await page.locator("#dialog").getAttribute("data-state"), "closing");
    await page.waitForFunction(() => !document.querySelector("#dialog").open);

    const amplitude = await page.evaluate(() => {
      const audio = new CF.Audio();
      let peak;
      audio.volume = 0.35;
      audio.ctx = {
        currentTime: 0,
        destination: {},
        createOscillator: () => ({
          type: "",
          frequency: { setValueAtTime() {} },
          connect() {}, start() {}, stop() {},
        }),
        createGain: () => ({
          gain: {
            setValueAtTime() {},
            exponentialRampToValueAtTime(value) { peak ??= value; },
          },
          connect() {},
        }),
      };
      audio.tone();
      return peak;
    });
    assert.ok(Math.abs(amplitude - 0.42525) < 1e-10);

    await page.locator('[data-action="play"]').click();
    await page.evaluate(() => {
      const session = CF.app.session;
      CF.app.current.name = "A rhythm with a deliberately long title that wraps on a narrow screen";
      session.phase = "running";
      session.startTick = 0;
      session.notes = Array.from({ length: 100 }, () => ({ ms: 0, judged: true }));
      session.counts = { Perfect: 100, Great: 0, Good: 0, Miss: 0 };
      session.judged = 100;
      session.weight = 100;
      session.maxCombo = 100;
      session.clock.time = () => 1000;
    });
    await page.waitForFunction(() => CF.app.state === "results");
    for (const [width, height] of [[1440, 900], [1024, 600], [390, 700], [360, 560], [320, 480]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(70);
      const layout = await page.evaluate(() => {
        const panel = document.querySelector(".result-panel");
        const rect = panel.getBoundingClientRect();
        return {
          left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          width: innerWidth, height: innerHeight,
        };
      });
      assert.ok(layout.left >= -1 && layout.top >= -1, JSON.stringify(layout));
      assert.ok(layout.right <= width + 1 && layout.bottom <= height + 1, JSON.stringify(layout));
      assert.ok(layout.scrollWidth <= width && layout.scrollHeight <= height, JSON.stringify(layout));
      if (width === 360) {
        const overlap = await page.evaluate(() => {
          const actions = document.querySelector(".result-panel .actions").getBoundingClientRect();
          const toast = document.querySelector("#toast").getBoundingClientRect();
          return { shown: document.querySelector("#toast").classList.contains("show"), toastTop: toast.top, actionsBottom: actions.bottom };
        });
        assert.ok(!overlap.shown || overlap.toastTop >= overlap.actionsBottom, JSON.stringify(overlap));
      }
      if (width === 360)
        await page.screenshot({ path: `${process.env.TEMP || "/tmp"}/chartflow-results-small.png` });
    }
    await page.evaluate(async () => {
      const settings = await CF.storage.settings();
      settings.bindings[7] = ["s", "d", "f", "g", "j", "k", "l"];
      settings.bindings[4] = ["a", "d", "j", "k"];
      await CF.storage.saveSettings(settings);
    });
    await page.reload();
    await page.waitForFunction(() => CF.app?.settings?.bindings?.[7]?.[6] === ";");
    assert.deepEqual(await page.evaluate(() => CF.app.settings.bindings[7]), ["s", "d", "f", "j", "k", "l", ";"]);
    assert.equal(await page.evaluate(() => CF.app.settings.bindings[4][0]), "a");
    assert.deepEqual(errors, []);
    console.log("PASS: badges, 7K keys, settings backdrop and modal motion, audio gain, and scroll-free results at desktop and mobile sizes.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
