const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, "../server.cjs")], {
    env: { ...process.env, PORT: "4176" },
    windowsHide: true,
  });
  try {
    await once(server.stdout, "data");
    for (const blocked of [true, false]) {
      const browser = await chromium.launch({
        channel: "msedge", headless: true,
        args: [`--autoplay-policy=${blocked ? "document-user-activation-required" : "no-user-gesture-required"}`],
      });
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const checkPlaying = async () => {
          await page.waitForFunction(() => CF.guide.intro && CF.guide.introMusic?.currentTime > 0.1);
          const state = await page.evaluate(() => ({
            playing: !CF.guide.introMusic.paused,
            source: CF.guide.introMusic.getAttribute("src"),
            drift: Math.abs((performance.now() - CF.guide.intro.start) / 1000 - CF.guide.introMusic.currentTime),
          }));
          assert.ok(state.playing);
          assert.equal(state.source, "audio/intro.ogg");
          assert.ok(state.drift < 0.25, JSON.stringify(state));
        };
        await page.goto("http://127.0.0.1:4176");
        // Let the initial autoplay decision settle before automation interacts.
        await page.waitForTimeout(500);
        if (blocked) {
          assert.ok(await page.evaluate(() => CF.guide.intro && CF.guide.introMusic.paused));
        } else await checkPlaying();
        assert.equal(await page.getByRole("button", { name: "Start with sound" }).count(), 0);
        await page.evaluate(async () => {
          window.previousMusic = CF.guide.introMusic;
          await CF.guide.close();
        });
        assert.ok(await page.evaluate(() => previousMusic.paused));
        await page.getByRole("button", { name: "Open beginner guide", exact: true }).click();
        assert.equal(await page.evaluate(() => CF.guide.step), 0);
        assert.equal(await page.evaluate(() => CF.guide.introMusic), null);
        assert.equal(await page.locator(".guide-intro-scene").count(), 0);

        // Slow audio loading must hold the animation at its start.
        if (!blocked) {
          let releaseAudio;
          const held = new Promise((resolve) => { releaseAudio = resolve; });
          await page.route("**/audio/intro.ogg", async (route) => { await held; await route.continue(); });
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => CF.guide.introMusic);
          assert.equal(await page.evaluate(() => CF.guide.intro), null);
          releaseAudio();
          await checkPlaying();
          await page.unroute("**/audio/intro.ogg");
          // Directly opening the HTML must resolve the same relative audio file.
          await page.goto(pathToFileURL(path.join(__dirname, "../index.html")).href);
          await checkPlaying();
        }
        const skipPage = await browser.newPage();
        skipPage.on("pageerror", (error) => errors.push(error.message));
        await skipPage.goto(pathToFileURL(path.join(__dirname, "../index.html")).href);
        await skipPage.waitForFunction(() => CF.guide.introMusic);
        await skipPage.keyboard.press("Space");
        await skipPage.waitForTimeout(500);
        assert.ok(await skipPage.evaluate(() => CF.guide.dialog.open && !CF.guide.closing));
        await skipPage.keyboard.down("Space");
        await skipPage.keyboard.down("Space");
        assert.ok(await skipPage.evaluate(() => !CF.guide.closing));
        await skipPage.keyboard.up("Space");
        await skipPage.evaluate(() => {
          window.skipMusic = CF.guide.introMusic;
          window.skipTime = skipMusic.currentTime;
          window.pauseEvents = 0;
          skipMusic.addEventListener("pause", () => pauseEvents++);
        });
        await skipPage.keyboard.press("Space");
        await skipPage.waitForTimeout(200);
        assert.ok(await skipPage.evaluate(() => {
          const opacity = +getComputedStyle(CF.guide.dialog).opacity;
          return CF.guide.closing && CF.guide.dialog.open && opacity > 0 && opacity < 1;
        }));
        await skipPage.waitForFunction(() => !CF.guide.dialog.open && !CF.guide.busy);
        assert.ok(await skipPage.evaluate(() => !skipMusic.paused && skipMusic.currentTime > skipTime));
        assert.equal(await skipPage.evaluate(() => pauseEvents), 0);
        assert.ok(await skipPage.evaluate(() => !CF.music.wanted));
        // The retained track still follows music volume and plays to its natural end.
        await skipPage.evaluate(() => CF.music.setVolume(0.3));
        await skipPage.waitForFunction(() => skipMusic.volume === 0.3);
        await skipPage.evaluate(() => { skipMusic.currentTime = skipMusic.duration - 0.9; });
        await skipPage.waitForFunction(() => !CF.music.continuingIntro &&
          CF.music.background?.[CF.music.current]?.volume === 0.3);
        assert.equal(await skipPage.evaluate(() => skipMusic.getAttribute("src")), null);
        await skipPage.close();
        assert.deepEqual(errors, []);
        console.log(`PASS: ${blocked ? "blocked audio continues animation without a button" : "autoplay + slow load + local HTML"}, replay and stop.`);
      } finally { await browser.close(); }
    }
  } finally { server.kill(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
