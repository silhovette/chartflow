const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, "../server.cjs")], {
    env: { ...process.env, PORT: "4177" }, windowsHide: true,
  });
  let browser;
  try {
    await once(server.stdout, "data");
    browser = await chromium.launch({ channel: "msedge", headless: true,
      args: ["--autoplay-policy=no-user-gesture-required"] });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const playing = () => page.waitForFunction(() => {
      const m = CF.music.background?.[CF.music.current];
      return m && !m.paused && m.volume === 1 && m.currentTime > 0;
    });
    const silent = () => page.waitForFunction(() => CF.music.background.every((m) => m.paused && m.volume === 0));
    await page.goto("http://127.0.0.1:4177");
    await page.waitForFunction(() => CF.guide.introMusic?.currentTime > 0.05);
    assert.equal(await page.evaluate(() => !!CF.music.background), false);
    assert.ok(await page.evaluate(() => CF.guide.introMusic.volume > 0 && CF.guide.introMusic.volume < 1));
    await page.waitForFunction(() => CF.guide.introMusic.volume === 1);
    await page.evaluate(() => CF.music.setVolume(0.3));
    assert.equal(await page.evaluate(() => CF.guide.introMusic.volume), 0.3);
    await page.evaluate(() => CF.music.setVolume(1));
    await page.evaluate(() => {
      window.oldIntro = CF.guide.introMusic;
      CF.guide.close();
    });
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => !oldIntro.paused && oldIntro.volume > 0 && oldIntro.volume < 1));
    await page.waitForFunction(() => !CF.guide.busy);
    assert.ok(await page.evaluate(() => oldIntro.paused));
    await playing();
    // Preview, cancel, save, and reload preserve independent audio controls.
    await page.locator('[data-action="settings"]').click();
    await page.locator('[name="musicVolume"]').fill("0");
    assert.equal(await page.evaluate(() => CF.music.background[CF.music.current].volume), 0);
    assert.equal(await page.evaluate(() => CF.app.audio.volume), 0.35);
    await page.keyboard.press("Escape");
    await playing();
    await page.locator('[data-action="settings"]').click();
    await page.locator('[name="musicVolume"]').fill("0.25");
    await page.locator('[name="volume"]').fill("0.6");
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await page.waitForFunction(() => CF.app.settings.musicVolume === 0.25);
    await page.reload();
    await page.waitForFunction(() => CF.music.background?.[CF.music.current]?.volume === 0.25);
    assert.equal(await page.evaluate(() => CF.app.audio.volume), 0.6);
    await page.locator('[data-action="settings"]').click();
    await page.locator('[name="musicVolume"]').fill("1");
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await playing();
    await page.evaluate(() => { window.originalBackground = CF.music.background[CF.music.current]; });
    await page.locator(".chart-row").first().click();
    assert.ok(await page.evaluate(() => CF.music.background[CF.music.current] === originalBackground && !originalBackground.paused));
    await page.locator('[data-action="edit"]').click();
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => originalBackground.volume > 0 && originalBackground.volume < 1 && !originalBackground.paused));
    await silent();
    await page.locator('[data-action="detail"]').click();
    await playing();
    await page.locator('[data-action="play"]').click();
    await silent();
    await page.evaluate(() => {
      CF.app.session.phase = "running";
      CF.app.session.started = true;
      CF.app.session.clock.seek(1000000);
    });
    await page.waitForFunction(() => CF.app.state === "results");
    await silent();
    await page.locator('[data-action="back"]').click();
    await playing();
    await page.locator('.sidebar [data-action="account"]').click();
    await page.waitForFunction(() => CF.app.state === "account");
    await playing();
    await page.locator('.sidebar [data-action="new"]').click();
    await page.waitForFunction(() => CF.app.state === "setup");
    await silent();
    await page.locator('[value="record"]').click();
    await page.waitForFunction(() => CF.app.state === "record");
    await silent();
    await page.keyboard.press("Space");
    await page.waitForFunction(() => CF.app.session.phase === "running");
    await silent();
    await page.keyboard.press("Escape");
    await page.locator('.sidebar button[data-action="library"]').click();
    await playing();

    // Local files support seeking; the minimal preview server does not serve byte ranges.
    await page.goto(pathToFileURL(path.join(__dirname, "../index.html")).href);
    await page.waitForFunction(() => CF.guide.introMusic?.currentTime > 0);
    await page.evaluate(() => CF.guide.close());
    await playing();
    assert.equal(await page.evaluate(() => CF.music.background[0].getAttribute("src")), "audio/background.mp3");

    // Both decoders play across the loop boundary, without silence or a reset on navigation.
    await page.waitForFunction(() => CF.music.background.every((m) => m.readyState >= 3));
    await page.evaluate(() => {
      window.oldIndex = CF.music.current;
      const m = CF.music.background[oldIndex];
      m.currentTime = m.duration - 0.7;
    });
    await page.waitForFunction(() => CF.music.current !== oldIndex);
    await page.waitForTimeout(160);
    const overlap = await page.evaluate(() => CF.music.background.map((m) => ({ paused: m.paused, volume: m.volume })));
    assert.ok(overlap.every((m) => !m.paused && m.volume > 0 && m.volume < 1), JSON.stringify(overlap));
    await playing();
    assert.ok(await page.evaluate(() => CF.music.background[oldIndex].paused));
    await page.evaluate(() => {
      CF.music.setScreen("editor");
      setTimeout(() => CF.music.setScreen("library"), 100);
    });
    await page.waitForTimeout(850);
    await playing();
    assert.equal(await page.evaluate(() => CF.music.background.filter((m) => !m.paused).length), 1);

    assert.deepEqual(errors, []);
    console.log("PASS: intro preserved, smooth fades, screen exclusions, uninterrupted ordinary navigation, crossfade loop, rapid switching and local HTML.");
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
