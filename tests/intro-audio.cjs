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
        assert.deepEqual(errors, []);
        console.log(`PASS: ${blocked ? "blocked audio continues animation without a button" : "autoplay + slow load + local HTML"}, replay and stop.`);
      } finally { await browser.close(); }
    }
  } finally { server.kill(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
