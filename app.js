"use strict";
(() => {
  const $ = (s) => document.querySelector(s),
    E = CF.ui.escape,
    T = CF.ui.time;
  const app = (CF.app = {
    state: "loading",
    charts: [],
    current: null,
    editor: null,
    session: null,
    audio: new CF.Audio(),
    pressed: new Set(),
    settings: {
      bindings: structuredClone(CF.bindings),
      sound: true,
      volume: 0.35,
    },
    pending: new Map(),
    saveTimers: new Map(),
  });
  const button = (label, action, cls = "", extra = "") =>
    `<button class="button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
  function saveStatus(text) {
    $("#save-status").textContent = text;
  }
  function markChanged(chart) {
    chart.ownerId ||= CF.storage.profileId;
    chart.updatedAt = Date.now();
    app.pending.set(chart.id, structuredClone(chart));
    saveStatus("Saving…");
    clearTimeout(app.saveTimers.get(chart.id));
    app.saveTimers.set(
      chart.id,
      setTimeout(() => persist(chart.id), 650),
    );
  }
  async function persist(id) {
    const chart = app.pending.get(id);
    if (!chart) return true;
    try {
      await CF.storage.save(chart);
      if (app.pending.get(id) === chart) app.pending.delete(id);
      saveStatus(app.pending.size ? "Saving…" : "All changes saved");
      return true;
    } catch (error) {
      saveStatus("Not saved · storage error");
      CF.ui.toast("Could not save. Export your chart to keep a copy.");
      return false;
    }
  }
  async function flush() {
    await Promise.all([...app.pending.keys()].map(persist));
  }
  async function saveNow(chart) {
    markChanged(chart);
    clearTimeout(app.saveTimers.get(chart.id));
    return persist(chart.id);
  }
  function setScreen(state, html, crumb) {
    closeChartMenu();
    app.audio.stop();
    app.pressed.clear();
    app.state = state;
    document.body.dataset.screen = state;
    $("#main").innerHTML = html;
    $("#main").classList.remove("screen-enter");
    void $("#main").offsetWidth;
    $("#main").classList.add("screen-enter");
    $("#breadcrumb").innerHTML = `Workspace <span>/</span> ${E(crumb)}`;
    document
      .querySelectorAll(".sidebar>.nav-item")
      .forEach((el) =>
        el.classList.toggle(
          "active",
          el.dataset.action ===
            (state === "account"
              ? "account"
              : state === "setup"
                ? "new"
                : "library"),
        ),
      );
    $("#nav-count").textContent = app.charts.length;
    window.scrollTo(0, 0);
  }
  function header(
    title,
    description,
    actions = "",
    eyebrow = "YOUR CREATIVE WORKSPACE",
  ) {
    return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div><div class="actions">${actions}</div></div>`;
  }
  function stats(chart) {
    return `<div class="stat-grid"><div class="stat"><strong>${chart.keyCount}K</strong><small>Key mode</small></div><div class="stat"><strong>${chart.bpm}</strong><small>Beats per minute</small></div><div class="stat"><strong>${chart.notes.length.toLocaleString()}</strong><small>Tap notes</small></div><div class="stat"><strong>${T(CF.duration(chart))}</strong><small>Duration</small></div></div>`;
  }
  function library() {
    app.editor?.stop(app.audio);
    app.session = null;
    app.current = null;
    app.editor = null;
    setScreen(
      "library",
      `${header("Your charts", "A space for your rhythm. Capture it. Shape it. Play it.", button("↥ <span>Import</span>", "import") + button("＋ New chart", "new", "primary"))}
  <section class="hero glass"><div class="hero-copy"><div class="eyebrow">FROM INSTINCT TO INSTRUMENT</div><h2>Find your rhythm.<br>Make it a chart.</h2><p>Perform into empty lanes. Turn a moment of flow<br>into something you can play, perfect, and keep.</p><div class="actions">${button("Start creating <span>↗</span>", "new", "primary")}</div></div><div class="hero-visual" aria-hidden="true"><div class="hero-art"><div class="hero-grid">${[0, 1, 2, 3].map((n) => `<div class="hero-lane">${[0, 1, 2].map((k) => `<i class="${n === 1 && k === 1 ? "hero-note-highlight" : ""}" style="top:calc(${15 + ((n * 21 + k * 32) % 80)}% - 4.5px)"></i>`).join("")}</div>`).join("")}<div class="hero-line"></div></div></div><div class="hero-label">EVERY PATTERN STARTS WITH A PULSE</div></div></section>
  <section aria-label="Chart library"><div class="section-bar"><div class="section-title">All charts <span class="pill">${app.charts.length}</span></div><div class="filter-group"><div class="search-wrap"><span>⌕</span><input class="search" id="search" placeholder="Search your charts…" aria-label="Search charts"></div><select id="sort" aria-label="Sort charts"><option value="recent">Recently edited</option><option value="name">Name A–Z</option><option value="bpm">BPM</option></select></div></div><div class="list-labels"><span>CHART / DETAILS</span><span>RHYTHM OVERVIEW</span><span>LAST EDITED</span><span style="text-align:right">ACTIONS</span></div><div class="chart-list" id="chart-list"></div><div class="library-note"><span id="library-count"></span><span>Stored locally <b>·</b> Ready when you are</span></div></section>
  <section class="workflow"><div class="workflow-step"><span class="step-number">01 —</span><div><h3>Perform freely</h3><p>The first key starts your recording.<br>Just you, empty lanes, and the beat.</p></div></div><div class="workflow-step"><span class="step-number">02 —</span><div><h3>Make it precise</h3><p>Automatic 1/32 quantization.<br>A full editor for the finer details.</p></div></div><div class="workflow-step"><span class="step-number">03 —</span><div><h3>Get into the flow</h3><p>Play your creation. Find your limits.<br>Refine it, then go again.</p></div></div></section>`,
      "Your charts",
    );
    $("#search").oninput = renderRows;
    $("#sort").onchange = renderRows;
    renderRows();
  }
  function renderRows() {
    const search = $("#search").value.toLowerCase(),
      sort = $("#sort").value;
    const charts = app.charts
      .filter((c) => c.name.toLowerCase().includes(search))
      .sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name)
          : sort === "bpm"
            ? a.bpm - b.bpm
            : b.updatedAt - a.updatedAt,
      );
    $("#chart-list").innerHTML = charts.length
      ? charts
          .map(
            (c) =>
              `<article class="chart-row glass" data-chart="${c.id}" data-action="detail" tabindex="0" aria-label="Open ${E(c.name)}"><div class="chart-identity"><div class="chart-icon">${c.keyCount}K</div><div><h3>${E(c.name)}</h3><div class="chart-meta"><span>${c.bpm} BPM</span><b>·</b><span>${c.notes.length} notes</span><b>·</b><span>${T(CF.duration(c))}</span></div></div></div>${CF.ui.density(c)}<span class="edited">${CF.ui.ago(c.updatedAt)}</span><div class="row-actions">${button("▷ Play", "play", "small play")}${button("Edit", "edit", "small ghost")}${button("···", "menu", "icon ghost", 'aria-label="Chart options"')}</div></article>`,
          )
          .join("")
      : `<div class="empty-state glass"><h2>${search ? "No matching charts" : "Your first rhythm starts here"}</h2><p>${search ? "Try another name." : "Create a chart, press a lane key, and follow your instinct."}</p>${search ? "" : button("＋ Create your first chart", "new", "primary")}</div>`;
    $("#library-count").textContent =
      `${charts.length} chart${charts.length === 1 ? "" : "s"}${app.charts.some((c) => c.demo) ? " · Includes starter patterns" : ""}`;
  }
  function setup() {
    setScreen(
      "setup",
      `<button class="back-link" data-action="library">← Back to library</button>${header("A new rhythm starts here.", "Set the tempo. Check your keys. The rest is yours.", "", "CREATE / SETUP")}
  <div class="setup-layout"><form id="setup-form" class="glass form-panel"><div class="section-kicker">01 / CHART DETAILS</div><label class="field">Chart name<input name="name" value="Untitled" maxlength="120" required></label><div class="field"><span>Key mode</span><div class="segmented" id="key-modes">${[4, 5, 6, 7, 8].map((k) => `<button type="button" data-keys="${k}" class="${k === 4 ? "selected" : ""}">${k}K <small> / ${k} lanes</small></button>`).join("")}</div></div><div class="field-row"><label class="field">Tempo · BPM<input name="bpm" type="number" min="20" max="500" step="1" value="180" required><small>One steady tempo for your entire chart.</small></label><label class="field">Scroll speed<input name="speed" type="number" min="1" max="25" step="0.1" value="15.0" required><small>Changes note travel speed during play.</small></label></div><div class="flow-line"></div><div class="create-paths"><button class="create-path" type="submit" name="creation" value="record"><strong>● Record a performance <span>→</span></strong><small>Play your pattern. Timing starts on your first key.</small></button><button class="create-path" type="submit" name="creation" value="blank"><strong>＋ Build from scratch <span>→</span></strong><small>Start with an empty editor. Place notes on your BPM grid.</small></button></div></form><aside class="glass setup-help"><div class="section-kicker">02 / KEY CHECK</div><h3>Meet your instrument.</h3><p>Press your lane keys together. Each key should light independently, including full chords.</p><div class="key-test" id="key-test"></div><p id="key-readout" style="text-align:center;font-size:11px" aria-live="polite">Detected 0 keys · Peak 0</p><p style="margin-top:8px;font-size:10px">Hold all lane keys together. This shows the keys your keyboard sends to the browser. If some stay dark, try another binding combination in Settings.</p><div class="hint-panel"><h3>Room for the rhythm.</h3><p>You'll see empty lanes while recording. Only the receptors respond to your performance.</p><div class="hint"><span>Pause / resume</span><kbd>P</kbd></div><div class="hint"><span>Finish & quantize</span><kbd>Enter</kbd></div><div class="hint"><span>Back / cancel</span><kbd>Esc</kbd></div></div></aside></div>`,
      "New chart",
    );
    app.setupKeys = 4;
    app.keyPeak = 0;
    renderKeyTest();
    $("#key-modes").onclick = (e) => {
      const b = e.target.closest("[data-keys]");
      if (!b) return;
      app.setupKeys = +b.dataset.keys;
      app.keyPeak = 0;
      app.pressed.clear();
      document
        .querySelectorAll("[data-keys]")
        .forEach((el) => el.classList.toggle("selected", el === b));
      renderKeyTest();
    };
    $("#setup-form").onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (!f.get("name").trim()) {
        e.target.elements.name.focus();
        return;
      }
      app.current = {
        id: CF.id(),
        name: f.get("name").trim(),
        keyCount: app.setupKeys,
        bpm: +f.get("bpm"),
        scrollSpeed: +f.get("speed"),
        ppqn: 384,
        notes: [],
        rawRecording: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      if (e.submitter?.value === "blank") {
        const chart = app.current;
        e.target
          .querySelectorAll('[type="submit"]')
          .forEach((b) => (b.disabled = true));
        app.charts.push(chart);
        await saveNow(chart);
        CF.progress.event("created");
        if (app.state === "setup" && app.current === chart) openEditor();
      } else record();
    };
  }
  function renderKeyTest() {
    const el = $("#key-test");
    if (!el) return;
    const keys = app.settings.bindings[app.setupKeys];
    if (el.dataset.keys !== keys.join("|")) {
      el.dataset.keys = keys.join("|");
      el.innerHTML = keys
        .map(
          (k, i) =>
            '<div class="test-key" data-lane="' +
            i +
            '">' +
            E(k.toUpperCase()) +
            "</div>",
        )
        .join("");
    }
    let count = 0;
    keys.forEach((key, i) => {
      const pressed = app.pressed.has(key);
      el.children[i].classList.toggle("pressed", pressed);
      if (pressed) count++;
    });
    app.keyPeak = Math.max(app.keyPeak || 0, count);
    $("#key-readout").textContent =
      "Detected " + count + " / " + keys.length + " keys · Peak " + app.keyPeak;
  }
  function detail(chart = app.current) {
    app.editor?.stop(app.audio);
    app.session = null;
    app.current = chart;
    const raw = chart.rawRecording.length;
    setScreen(
      "detail",
      `<button class="back-link" data-action="library">← Back to library</button><section class="glass detail-hero"><div class="detail-title"><div><div class="eyebrow">CHART VIEW ${chart.demo ? " / STARTER PATTERN" : ""}</div><h1>${E(chart.name)}</h1></div><div class="actions">${button("▷ Play chart", "play", "primary")}${button("✎ Open editor", "edit")}</div></div>${stats(chart)}<div class="detail-density"><div class="section-kicker">RHYTHM / DENSITY OVER TIME</div>${CF.ui.density(chart, true)}<div class="detail-info" style="margin-top:16px"><span>00:00</span><span>${T(CF.duration(chart))}</span></div></div><div class="flow-line"></div><div class="detail-info"><span>Created ${new Date(chart.createdAt).toLocaleDateString()} <b>·</b> Edited ${CF.ui.ago(chart.updatedAt)}</span><span>384 PPQN <b>·</b> Tap notes only</span></div></section><div class="detail-subgrid"><section class="glass"><div class="section-kicker">THE ORIGINAL PERFORMANCE</div><h3>${raw ? `${raw} raw inputs preserved` : "A pattern ready to make your own"}</h3><p>${raw ? `Cleaned to a 1/32 grid. ${chart.collisions || 0} timing conflicts. Your original timestamps stay intact through every edit.` : "Open the editor to explore this chart, add a new phrase, or make a copy before experimenting."}</p></section><section class="glass"><div class="section-kicker">CHART MANAGEMENT</div><div class="actions">${button("Rename", "rename", "small")}${button("Duplicate", "duplicate", "small")}${button("↧ Export JSON", "export", "small")}${button("Delete", "delete", "small ghost")}</div><p style="margin-top:16px">Saved on this device. Export a copy to take your rhythm with you.</p></section></div>`,
      "Chart View",
    );
  }
  function speedControl() {
    return (
      '<label class="speed-control">Scroll speed <input id="scroll-speed" type="number" min="1" max="25" step="0.5" value="' +
      app.current.scrollSpeed +
      '" aria-label="Scroll speed"></label>'
    );
  }
  function bindSpeed() {
    const input = $("#scroll-speed");
    if (!input) return;
    input.onchange = () => {
      if (!input.checkValidity() || !input.value) {
        input.value = app.current.scrollSpeed;
        return;
      }
      app.current.scrollSpeed = Number(input.value);
      if (app.state === "play" && !app.session.started) {
        const travel = CF.highway.geometry(
          $("#stage-canvas").getBoundingClientRect().height,
          app.current.scrollSpeed,
        ).travelMs;
        app.session.clock.seek(
          CF.toMs(app.session.startTick, app.current.bpm) - travel,
        );
      }
      markChanged(app.current);
      input.blur();
    };
  }
  function stageHTML(mode) {
    const c = app.current,
      rec = mode === "record";
    return `<div class="page-heading editor-heading"><div><div class="eyebrow">${rec ? "CAPTURE / LIVE PERFORMANCE" : app.testing ? "EDITOR / TEST SESSION" : "PLAY / FIND YOUR FLOW"}</div><h1>${E(c.name)}</h1></div><div class="actions">${rec ? "" : speedControl()}${button("← " + (app.testing ? "Back to editor" : "Back"), "back")}${button("Ⅱ Pause", "pause", "", 'id="pause-button"')}${rec ? button("Finish ↵", "finish", "primary", 'disabled title="Start recording with a lane key first."') : ""}</div></div><div class="stage-layout"><aside class="stage-side"><div class="section-kicker">${rec ? "THE EMPTY INSTRUMENT" : "YOUR PERFORMANCE"}</div><h2>${c.keyCount} lanes.<br>One flow.</h2><p>${rec ? "Let your hands find the pattern.<br>Nothing falls. Everything listens." : "Follow the notes to the line.<br>Every note is a new beginning."}</p><div class="stage-status" id="stage-status"><i class="led"></i>${rec ? "READY" : "COUNT IN"}</div><div class="live-time" id="live-time">00:00.000</div><div class="stat"><strong>${c.bpm}<small>BPM</small></strong></div><div class="beat-display" id="beats">${[1, 2, 3, 4].map((n) => `<span>${n}</span>`).join("")}</div></aside><div class="stage"><canvas id="stage-canvas" aria-label="${rec ? "Empty recording lanes" : "Falling-note playfield"}"></canvas><div class="stage-overlay" id="stage-overlay"><h2>${rec ? "READY" : ""}</h2><p>${rec ? "Press any lane key to begin" : "Find your position"}</p></div></div><aside class="stage-side"><div class="section-kicker">${rec ? "LIVE SESSION" : "SESSION STATS"}</div><div class="stat"><strong id="stat-main">0</strong><small>${rec ? "Inputs captured" : "Combo"}</small></div><div class="stat"><strong id="stat-secondary">${rec ? "1/32" : "100.00%"}</strong><small>${rec ? "Finish quantization" : "Accuracy"}</small></div>${rec ? '<div class="hint-panel"><p>Raw timing is always preserved.<br><br>Pause whenever you need.<br>A four-step count-in brings you back.</p></div>' : '<div class="judgements" id="judgements"></div>'}</aside></div><div class="stage-hints"><span><kbd>P</kbd> Pause / resume</span><span>${rec ? "<kbd>Enter</kbd> Finish recording" : "Hit notes at the line"}</span><span><kbd>Esc</kbd> Back</span></div>`;
  }
  function record() {
    app.audio.unlock();
    app.testing = false;
    setScreen("record", stageHTML("record"), "Record");
    app.session = {
      clock: new CF.Clock(),
      phase: "ready",
      raw: [],
      flashes: [],
      countUntil: 0,
    };
  }
  function countIn(beats, resuming = false) {
    const s = app.session;
    s.phase = "countin";
    s.countStart =
      performance.now() + (app.state === "play" && !resuming ? 1000 : 0);
    s.countBeat = resuming ? 60000 / app.current.bpm : 700;
    s.countBeats = beats;
    s.countUntil = s.countStart + s.countBeat * beats;
    s.lastCount = -1;
    app.audio.unlock();
    updateStage();
  }
  function play(fromTick = 0, testing = false) {
    app.editor?.stop(app.audio);
    app.testing = testing;
    app.audio.unlock();
    setScreen("play", stageHTML("play"), testing ? "Test chart" : "Play");
    app.session = {
      clock: new CF.Clock(
        CF.toMs(fromTick, app.current.bpm) -
          CF.highway.geometry(
            $("#stage-canvas").getBoundingClientRect().height,
            app.current.scrollSpeed,
          ).travelMs,
      ),
      started: false,
      phase: "countin",
      flashes: [],
      notes: app.current.notes
        .filter((n) => n.tick >= fromTick)
        .map((n) => ({
          ...n,
          ms: CF.toMs(n.tick, app.current.bpm),
          judged: false,
        })),
      counts: { Perfect: 0, Great: 0, Good: 0, Miss: 0 },
      combo: 0,
      maxCombo: 0,
      weight: 0,
      judged: 0,
      feedback: [],
      hitEffects: [],
      startTick: fromTick,
    };
    app.session.laneNotes = Array.from(
      { length: app.current.keyCount },
      (_, lane) => app.session.notes.filter((n) => n.lane === lane),
    );
    app.session.laneHeads = Array(app.current.keyCount).fill(0);
    bindSpeed();
    countIn(3);
  }
  function pause() {
    const s = app.session;
    if (!s) return;
    if (s.phase === "ready") return;
    if (s.phase === "running" || s.phase === "countin") {
      s.clock.pause();
      s.phase = "paused";
      app.audio.stop();
    } else if (s.phase === "paused")
      countIn(app.state === "record" ? 4 : 3, true);
    app.pressed.clear();
    updateStage();
  }
  function updateStage() {
    const s = app.session;
    if (!s || !$("#stage-overlay")) return;
    let title = "",
      sub = "";
    if (s.phase === "ready") {
      title = "READY";
      sub = "Press any lane key to begin";
    } else if (s.phase === "paused") {
      title = "PAUSED";
      sub = "Press P when you’re ready";
    } else if (s.phase === "countin") {
      const n = Math.min(
        s.countBeats,
        Math.floor((performance.now() - s.countStart) / s.countBeat) + 1,
      );
      title =
        performance.now() < s.countStart
          ? ""
          : app.state === "record"
            ? String(n)
            : String(s.countBeats - n + 1);
      sub = "Get ready · time is frozen";
    }
    $("#stage-overlay").innerHTML = title
      ? `<h2>${title}</h2><p>${sub}</p>`
      : "";
    const status = $("#stage-status");
    status.classList.toggle("paused", s.phase === "paused");
    status.style.color =
      app.state === "play" && s.phase !== "paused" ? "var(--blue)" : "";
    status.innerHTML = `<i class="led"></i>${s.phase === "running" ? (app.state === "record" ? "RECORDING" : "PLAYING") : s.phase.toUpperCase()}`;
    $("#pause-button").textContent =
      s.phase === "paused" ? "▷ Resume" : "Ⅱ Pause";
    $("#pause-button").disabled = s.phase === "ready";
  }
  async function finish() {
    if (app.state !== "record") return;
    const s = app.session;
    if (!s?.raw.length) {
      CF.ui.toast("Start recording with a lane key first.");
      return;
    }
    s.clock.pause();
    app.audio.stop();
    app.current.rawRecording = s.raw.map((e) => ({ ...e }));
    const result = CF.quantize(s.raw, app.current.bpm);
    Object.assign(app.current, result);
    app.charts.push(app.current);
    setScreen(
      "processing",
      `<div class="processing"><div class="eyebrow">PERFORMANCE → PATTERN</div><h2>Chart ready.</h2><div class="flow-line"></div><p>${result.notes.length} notes created · ${result.collisions} timing conflicts</p><small>Your original ${s.raw.length} inputs are preserved.</small></div>`,
      "Finishing recording",
    );
    await saveNow(app.current);
    CF.progress.event("created");
    if (s.raw.length) CF.progress.event("recorded");
    setTimeout(() => {
      if (app.state === "processing") detail();
    }, 450);
  }
  function judge(note, label, weight) {
    const s = app.session;
    note.judged = true;
    s.counts[label]++;
    s.judged++;
    s.weight += weight;
    s.combo = label === "Miss" ? 0 : s.combo + 1;
    s.maxCombo = Math.max(s.combo, s.maxCombo);
    s.feedback[note.lane] = { label, at: performance.now() };
    if (weight > 0)
      s.hitEffects.push({ lane: note.lane, at: performance.now() });
  }
  function hit(lane, now) {
    const s = app.session,
      t = s.clock.time(now);
    // Each key only searches its own lane; an eight-key chord never waits on
    // eight full-chart filters/sorts or shares a single pending key slot.
    const laneNotes = s.laneNotes[lane];
    let head = s.laneHeads[lane];
    while (head < laneNotes.length && laneNotes[head].judged) head++;
    s.laneHeads[lane] = head;
    let n = null,
      delta = Infinity;
    for (let i = head; i < laneNotes.length; i++) {
      const note = laneNotes[i];
      if (note.ms > t + 140) break;
      if (note.judged) continue;
      const difference = Math.abs(note.ms - t);
      if (difference <= 140 && difference < delta) {
        n = note;
        delta = difference;
      }
    }
    if (!n) return;
    judge(
      n,
      delta <= 40 ? "Perfect" : delta <= 85 ? "Great" : "Good",
      delta <= 40 ? 1 : delta <= 85 ? 0.75 : 0.4,
    );
    app.audio.tone(290 + lane * 85, undefined, 0.045, 0.6);
  }
  function results() {
    const s = app.session;
    app.audio.stop();
    s.clock.pause();
    const accuracy = s.judged ? (s.weight / s.judged) * 100 : 0,
      grade =
        accuracy >= 98
          ? "S"
          : accuracy >= 90
            ? "A"
            : accuracy >= 80
              ? "B"
              : accuracy >= 65
                ? "C"
                : "D";
    const gradeMessage = {
      S: "You and the rhythm, in perfect sync.",
      A: "A brilliant run. Your rhythm shines.",
      B: "A steady pulse. Your flow is taking shape.",
      C: "The rhythm is within reach. Keep going.",
      D: "Every rhythm starts with a first step.",
    };
    CF.progress.complete(app.current, s, accuracy, grade, app.testing);
    setScreen(
      "results",
      `<section class="glass result-panel"><div class="eyebrow">SESSION COMPLETE</div><h2>${E(app.current.name)}</h2><div class="result-grade">${s.notes.length ? grade : "—"}</div><p>${s.notes.length ? gradeMessage[grade] : "An empty canvas. Add a few notes to begin."}</p><div class="stat-grid"><div class="stat"><strong>${accuracy.toFixed(2)}%</strong><small>Accuracy</small></div><div class="stat"><strong>${s.maxCombo}</strong><small>Max combo</small></div><div class="stat"><strong>${Math.round(s.weight * 1000).toLocaleString()}</strong><small>Score</small></div><div class="stat"><strong>${s.counts.Miss}</strong><small>Misses</small></div></div><div class="judgements">${Object.entries(
        s.counts,
      )
        .map(
          ([key, n]) => `<span style="margin:0 10px">${key} <b>${n}</b></span>`,
        )
        .join(
          "",
        )}</div><div class="flow-line"></div><div class="actions">${button("▷ Try again", "retry", "primary")}${button(app.testing ? "← Back to editor" : "Chart View", "back")}${!app.testing ? button("Refine in editor", "edit") : ""}</div></section>`,
      "Results",
    );
  }
  function openEditor(preserve = false) {
    app.session = null;
    app.testing = false;
    if (!preserve || !app.editor || app.editor.chart.id !== app.current.id)
      app.editor = new CF.Editor(app.current, (chart) => {
        markChanged(chart);
        CF.progress.event("edits");
      });
    const ed = app.editor;
    setScreen(
      "editor",
      `${header(E(app.current.name), "Shape the rhythm, one detail at a time.", button("← Chart View", "detail"), "EDIT / MUSICAL TIMELINE")}<section class="glass editor-shell"><div class="editor-toolbar">${button("↶", "undo", "icon", 'id="undo" title="Undo (Ctrl+Z)" aria-label="Undo"')}${button("↷", "redo", "icon", 'id="redo" title="Redo (Ctrl+Y)" aria-label="Redo"')}<span class="divider" style="margin:0 5px"></span><label>Snap <select id="snap">${[4, 8, 12, 16, 24, 32, 48, 64, 96, 128].map((n) => `<option value="${n}" ${n === ed.snap ? "selected" : ""}>1/${n}</option>`).join("")}</select></label>${button("＋ Note", "add-note", "small", 'title="Add at cursor"')}${button("Resnap", "resnap", "small", 'id="resnap" title="Resnap selection"')}${button("⌫", "delete-notes", "small", 'id="delete-notes" aria-label="Delete selected notes"')}<span class="toolbar-spacer"></span>${speedControl()}${button("▷ Preview", "timeline-play", "small", 'id="timeline-play"')}${button("← Timeline", "stop-preview", "small", 'id="stop-preview" hidden')}${button("Test here ↗", "test", "small primary")}${button("From start", "test-start", "small ghost")}</div><div class="editor-workspace"><canvas class="editor-canvas" id="editor-canvas" tabindex="0" aria-label="Chart timeline. Click empty grid to add notes. Right click notes to delete. Ctrl click to select multiple. Drag notes to move."></canvas><aside class="editor-inspector"><div class="section-kicker">SELECTION</div><h3 id="selection-count">0 selected</h3><p>Click a note to select.<br>Drag a pattern to reshape it.</p><div class="hint-panel"><div class="section-kicker">QUICK CONTROLS</div><div class="hint"><span>Add note</span><kbd>Left click</kbd></div><div class="hint"><span>Multi-select</span><kbd>Ctrl click</kbd></div><div class="hint"><span>Delete note</span><kbd>Right click</kbd></div><div class="hint"><span>Move</span><kbd>↑ ↓ ← →</kbd></div><div class="hint"><span>Copy / paste</span><kbd>Ctrl C / V</kbd></div><div class="hint"><span>Zoom</span><kbd>Ctrl wheel</kbd></div><div class="hint"><span>Preview</span><kbd>P</kbd></div></div><div class="hint-panel"><p>Snap affects your next edit.<br>Use Resnap to change existing notes.<br><br>Ctrl-click empty space to place the cursor for pasting or testing. Drag empty space to box-select.</p></div></aside></div><div class="editor-statusbar"><span id="editor-time">00:00.000</span><span>${app.current.bpm} BPM</span><span id="editor-note-count"></span><span class="right">ZOOM <b id="editor-zoom">100%</b></span></div></section>`,
      "Editor",
    );
    $("#snap").onchange = (e) => {
      ed.snap = +e.target.value;
    };
    bindSpeed();
    ed.attach($("#editor-canvas"));
    ed.updateUI();
  }
  async function back() {
    if ($("#dialog").open) {
      $("#dialog").close("cancel");
      return;
    }
    if (app.state === "record") {
      const s = app.session,
        has = s.raw.length;
      if (has) {
        if (s.phase === "running" || s.phase === "countin") pause();
        const answer = await CF.ui.dialog({
          title: "Discard this recording?",
          body: `Your ${s.raw.length} captured inputs have not been saved.`,
          confirm: "Discard",
          danger: true,
        });
        if (!answer) return;
      }
      app.session = null;
      setup();
    } else if ((app.state === "play" || app.state === "results") && app.testing)
      openEditor(true);
    else if (["play", "results", "editor"].includes(app.state)) {
      await flush();
      detail();
    } else library();
  }
  async function rename() {
    const c = app.current,
      answer = await CF.ui.dialog({
        title: "Rename chart",
        body: `<label class="field">Chart name<input name="name" value="${E(c.name)}" maxlength="120" required></label>`,
        confirm: "Save name",
      });
    if (!answer) return;
    const name = answer.name.trim();
    if (!name) {
      CF.ui.toast("Please enter a chart name.");
      return;
    }
    c.name = name;
    await saveNow(c);
    if (app.state === "library") renderRows();
    else detail(c);
  }
  async function duplicate() {
    const c = structuredClone(app.current);
    c.id = CF.id();
    c.name = (c.name + " (Copy)").slice(0, 120);
    c.notes.forEach((n) => (n.id = CF.id()));
    c.createdAt = c.updatedAt = Date.now();
    delete c.demo;
    app.charts.push(c);
    await saveNow(c);
    CF.ui.toast("Independent copy created");
    if (app.state === "library") library();
    else detail(c);
  }
  function exportChart() {
    const c = app.current,
      url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              { format: "chartflow", version: 1, chart: c },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
    const a = document.createElement("a");
    a.href = url;
    a.download =
      (c.name.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "-") ||
        "untitled") + ".chartflow.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    CF.ui.toast("Chart exported with original performance data");
  }
  async function deleteChart() {
    const c = app.current;
    const yes = await CF.ui.dialog({
      title: "Delete this chart?",
      body: `“${E(c.name)}” will be removed from this device. Export a copy first if you want to keep it.`,
      confirm: "Delete chart",
      danger: true,
    });
    if (!yes) return;
    await flush();
    await CF.storage.remove(c.id);
    app.charts = app.charts.filter((x) => x.id !== c.id);
    library();
    CF.ui.toast("Chart deleted");
  }
  let menuAnchor = null;
  function closeChartMenu(restoreFocus = false) {
    $("#chart-menu")?.remove();
    menuAnchor?.setAttribute("aria-expanded", "false");
    if (restoreFocus) menuAnchor?.focus({ preventScroll: true });
    menuAnchor = null;
  }
  function menu(anchor) {
    const wasOpen = menuAnchor === anchor;
    closeChartMenu();
    if (wasOpen) return;
    menuAnchor = anchor;
    anchor.setAttribute("aria-haspopup", "menu");
    anchor.setAttribute("aria-expanded", "true");
    const popup = document.createElement("div");
    popup.id = "chart-menu";
    popup.className = "chart-menu";
    popup.setAttribute("role", "menu");
    popup.setAttribute("aria-label", "Chart options");
    popup.innerHTML = [
      ["Rename", "rename"],
      ["Duplicate", "duplicate"],
      ["Export JSON", "export"],
      ["Delete chart", "delete"],
    ]
      .map(
        ([label, action]) =>
          `<button type="button" role="menuitem" data-action="${action}" class="${action === "delete" ? "menu-danger" : ""}">${label}</button>`,
      )
      .join("");
    document.body.append(popup);
    const rect = anchor.getBoundingClientRect(),
      height = popup.offsetHeight;
    popup.style.left =
      Math.max(
        8,
        Math.min(
          innerWidth - popup.offsetWidth - 8,
          rect.right - popup.offsetWidth,
        ),
      ) + "px";
    popup.style.top =
      Math.max(
        8,
        rect.bottom + 6 + height <= innerHeight - 8
          ? rect.bottom + 6
          : rect.top - height - 6,
      ) + "px";
    popup.querySelector("button").focus({ preventScroll: true });
  }
  document.addEventListener("pointerdown", (e) => {
    if (
      menuAnchor &&
      !e.target.closest("#chart-menu") &&
      e.target !== menuAnchor
    )
      closeChartMenu();
  });
  window.addEventListener("resize", () => closeChartMenu());
  window.addEventListener("scroll", () => closeChartMenu(), true);
  async function settings() {
    if (
      ["record", "play"].includes(app.state) &&
      ["running", "countin"].includes(app.session.phase)
    )
      pause();
    app.editor?.stop(app.audio);
    const answer = await CF.ui.dialog({
      title: "Make yourself at home.",
      body: `<label class="check-field"><input name="sound" type="checkbox" ${app.settings.sound ? "checked" : ""}> Metronome & feedback sound</label><label class="field">Volume<input name="volume" type="range" min="0" max="1" step="0.05" value="${app.settings.volume}"></label><div class="section-kicker" style="margin:25px 0 15px">LANE BINDINGS</div>${[4, 5, 6, 7, 8].map((k) => `<div class="settings-mode"><span>${k}K</span><div class="settings-bindings">${app.settings.bindings[k].map((key, i) => `<input name="key-${k}-${i}" value="${E(key)}" maxlength="1" required aria-label="${k}K lane ${i + 1}" pattern="[a-oA-Oq-zQ-Z0-9;]">`).join("")}</div></div>`).join("")}<p style="margin-top:18px;font-size:10px">Use unique letters, numbers, or semicolon in each mode. P, Enter and Escape are reserved. Ctrl / Cmd shortcuts always take priority.</p>`,
      confirm: "Save settings",
      onOpen: (el) => {
        el.querySelectorAll(".settings-bindings input").forEach(
          (input) =>
            (input.onkeydown = (e) => {
              if (e.ctrlKey || e.metaKey || e.altKey) {
                e.preventDefault();
                return;
              }
              if (e.key === "p" || e.key === "P") {
                e.preventDefault();
                CF.ui.toast("P is reserved for pause.");
              }
            }),
        );
        el.querySelector("form").addEventListener("submit", (e) => {
          if (e.submitter?.value !== "confirm") return;
          for (const k of [4, 5, 6, 7, 8]) {
            const inputs = [...el.querySelectorAll(`[name^="key-${k}-"]`)];
            const values = inputs.map((i) => i.value.toLowerCase());
            if (new Set(values).size !== k) {
              e.preventDefault();
              CF.ui.toast(`Each ${k}K lane needs a different key.`);
              return;
            }
          }
        });
      },
    });
    if (!answer) return;
    for (const k of [4, 5, 6, 7, 8])
      app.settings.bindings[k] = Array.from({ length: k }, (_, i) =>
        answer[`key-${k}-${i}`].toLowerCase(),
      );
    app.settings.sound = answer.sound === "on";
    app.settings.volume = +answer.volume;
    app.audio.enabled = app.settings.sound;
    app.audio.volume = app.settings.volume;
    await CF.storage.saveSettings(app.settings);
    renderKeyTest();
    CF.ui.toast("Settings saved");
  }
  async function help() {
    if (
      ["record", "play"].includes(app.state) &&
      ["running", "countin"].includes(app.session?.phase)
    )
      pause();
    app.editor?.stop(app.audio);
    CF.guide.open();
  }
  const actions = {
    account: () => CF.account.show(),
    library: async () => {
      if (app.state === "record") {
        await back();
        return;
      }
      app.editor?.stop(app.audio);
      await flush();
      library();
    },
    new: async () => {
      if (app.state === "record") {
        await back();
        return;
      }
      app.editor?.stop(app.audio);
      await flush();
      setup();
    },
    import: () => $("#import-file").click(),
    detail: () => detail(),
    play: () => play(),
    edit: () => openEditor(),
    menu,
    rename,
    duplicate,
    export: exportChart,
    delete: deleteChart,
    settings,
    help,
    back,
    pause,
    finish,
    retry: () => play(app.session.startTick, app.testing),
    undo: () => app.editor.undo(),
    redo: () => app.editor.redo(),
    "add-note": () => app.editor.add(),
    resnap: () => app.editor.resnap(),
    "delete-notes": () => app.editor.remove(),
    "timeline-play": () => app.editor.toggle(app.audio),
    "stop-preview": () => app.editor.stop(app.audio),
    test: () => play(app.editor.cursor, true),
    "test-start": () => play(0, true),
  };
  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    e.preventDefault();
    const c = el.closest("[data-chart]");
    if (c) app.current = app.charts.find((x) => x.id === c.dataset.chart);
    const action = el.dataset.action;
    if (el.closest("#chart-menu")) closeChartMenu();
    try {
      await actions[action]?.(el);
    } catch (error) {
      console.error(error);
      CF.ui.toast(error.message || "That action could not be completed.");
    }
  });
  $("#import-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 30 * 1024 * 1024)
        throw new Error("Please choose a chart file smaller than 30 MB.");
      const c = CF.validate(JSON.parse(await file.text()));
      app.charts.push(c);
      await saveNow(c);
      if (!["record", "play", "editor"].includes(app.state)) detail(c);
      CF.ui.toast("Chart imported as an independent copy");
    } catch (error) {
      CF.ui.toast(error.message || "Could not read this chart file.");
    }
    e.target.value = "";
  };
  function laneKey(event) {
    if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase();
    if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
    if (event.code === "Semicolon") return ";";
    return event.key.toLowerCase();
  }
  document.addEventListener("keydown", (e) => {
    if ($("#guide").open) return;
    if (menuAnchor) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeChartMenu(true);
        return;
      }
      if (e.key === "Tab") {
        closeChartMenu();
        return;
      }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const items = [...$("#chart-menu").querySelectorAll("button")];
        const index = items.indexOf(document.activeElement);
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length;
        items[next].focus();
        return;
      }
    }
    if ($("#dialog").open) return;
    const typing = e.target.matches(
      'input,select,textarea,[contenteditable="true"]',
    );
    if (typing) return;
    if (e.key === "Enter" && e.target.matches("[data-chart]")) {
      e.preventDefault();
      app.current = app.charts.find((c) => c.id === e.target.dataset.chart);
      detail();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      back();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && app.state === "editor") {
      app.editor.key(e);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = laneKey(e);
    if (key === "p") {
      e.preventDefault();
      if (e.repeat) return;
      if (app.state === "editor") app.editor.toggle(app.audio);
      else if (["record", "play"].includes(app.state)) pause();
      return;
    }
    if (e.key === "Enter" && app.state === "record") {
      e.preventDefault();
      if (!e.repeat) finish();
      return;
    }
    if (app.state === "editor" && app.editor.key(e)) return;
    if (!["setup", "record", "play"].includes(app.state)) return;
    const count = app.state === "setup" ? app.setupKeys : app.current.keyCount,
      lane = app.settings.bindings[count].indexOf(key);
    if (lane < 0) return;
    e.preventDefault();
    if (e.repeat || app.pressed.has(key)) return;
    app.pressed.add(key);
    app.audio.unlock();
    if (app.state === "setup") {
      renderKeyTest();
      return;
    }
    const s = app.session,
      wall = performance.now(),
      now = Math.abs(e.timeStamp - wall) < 10000 ? e.timeStamp : wall;
    s.flashes[lane] = wall;
    if (app.state === "record") {
      if (s.phase === "ready") {
        s.clock.start(now);
        s.phase = "running";
        app.audio.metronome(s.clock, app.current.bpm);
        updateStage();
      }
      if (s.phase === "running") {
        s.raw.push({ lane, timestampMs: s.clock.time(now) });
        const finishButton = $('[data-action="finish"]');
        finishButton.disabled = false;
        finishButton.removeAttribute("title");
      }
    } else if (s.phase === "running") hit(lane, now);
  });
  document.addEventListener("keyup", (e) => {
    app.pressed.delete(laneKey(e));
    if (app.state === "setup") renderKeyTest();
  });
  window.addEventListener("blur", () => {
    app.pressed.clear();
    renderKeyTest();
    if (
      ["record", "play"].includes(app.state) &&
      ["running", "countin"].includes(app.session?.phase)
    )
      pause();
    if (app.state === "editor") app.editor.stop(app.audio);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      flush();
      if (
        ["record", "play"].includes(app.state) &&
        ["running", "countin"].includes(app.session?.phase)
      )
        pause();
      app.editor?.stop(app.audio);
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (
      app.pending.size ||
      (app.state === "record" && app.session?.raw.length)
    ) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  function drawStage(now) {
    const s = app.session,
      c = app.current,
      canvas = $("#stage-canvas");
    if (!s || !canvas) return;
    if (s.phase === "countin") {
      if (now >= s.countUntil) {
        s.phase = "running";
        s.started = true;
        s.clock.start(s.countUntil);
        if (app.state === "record") app.audio.metronome(s.clock, c.bpm);
        updateStage();
      } else {
        const beat = Math.floor((now - s.countStart) / s.countBeat);
        if (beat >= 0 && beat !== s.lastCount) {
          s.lastCount = beat;
          app.audio.tone(beat === 0 ? 1000 : 650);
          updateStage();
        }
      }
    }
    const t = s.clock.time(now);
    if (app.state === "play" && s.phase === "running") {
      for (const n of s.notes)
        if (!n.judged && t - n.ms > 140) judge(n, "Miss", 0);
    }
    if (s.hitEffects)
      s.hitEffects = s.hitEffects.filter((hit) => now - hit.at < 520);
    const { ctx, w, h, lw, line } = CF.highway.draw(canvas, c, {
      time: t,
      notes: app.state === "play" && s.started ? s.notes : [],
      flashes: s.flashes,
      hits: s.hitEffects,
      showBindings: app.state === "record",
      pressed: app.pressed,
      bindings: app.settings.bindings[c.keyCount],
      now,
    });
    if (app.state === "play") {
      for (let i = 0; i < c.keyCount; i++) {
        const f = s.feedback[i];
        if (f && now - f.at < 500) {
          ctx.globalAlpha = Math.max(0, 1 - (now - f.at) / 500);
          ctx.fillStyle =
            f.label === "Miss"
              ? "#ff6f7d"
              : f.label === "Perfect"
                ? "#6fe7d2"
                : "#e4d7a3";
          ctx.font = "9px Consolas,monospace";
          ctx.fillText(f.label.toUpperCase(), (i + 0.5) * lw, line - 35);
          ctx.globalAlpha = 1;
        }
      }
      $("#stat-main").textContent = s.combo;
      $("#stat-secondary").textContent =
        `${(s.judged ? (s.weight / s.judged) * 100 : 100).toFixed(2)}%`;
      if (s.renderedJudged !== s.judged) {
        s.renderedJudged = s.judged;
        $("#judgements").innerHTML =
          "<div><span>Score</span><b>" +
          Math.round(s.weight * 1000).toLocaleString() +
          "</b></div>" +
          Object.entries(s.counts)
            .map(([label, n]) => `<div><span>${label}</span><b>${n}</b></div>`)
            .join("");
      }
      if (
        s.phase === "running" &&
        s.notes.every((n) => n.judged) &&
        t > (s.notes.at(-1)?.ms || CF.toMs(s.startTick, c.bpm)) + 500
      ) {
        results();
        return;
      }
    } else $("#stat-main").textContent = s.raw.length;
    $("#live-time").textContent = T(t, true);
    const beat = Math.floor(t / (60000 / c.bpm)) % 4;
    document
      .querySelectorAll("#beats span")
      .forEach((el, i) =>
        el.classList.toggle("on", s.phase === "running" && i === beat),
      );
  }
  function frame(now) {
    try {
      if (["record", "play"].includes(app.state)) drawStage(now);
      else if (app.state === "editor") app.editor.draw(app.audio);
    } catch (error) {
      console.error(error);
    }
    requestAnimationFrame(frame);
  }
  function demo(name, keys, bpm, bars, index) {
    const notes = [];
    for (let beat = 0; beat < bars * 4; beat++) {
      notes.push({
        id: CF.id(),
        lane: (beat + index) % keys,
        tick: beat * 384,
      });
      if (beat % 4 === 0)
        notes.push({
          id: CF.id(),
          lane: (beat + index + 2) % keys,
          tick: beat * 384,
        });
      if (beat % 4 === 2) {
        notes.push({
          id: CF.id(),
          lane: (beat + index + 1) % keys,
          tick: beat * 384 + 192,
        });
        notes.push({
          id: CF.id(),
          lane: (beat + index + 3) % keys,
          tick: beat * 384 + 288,
        });
      }
    }
    return {
      id: CF.id(),
      name,
      keyCount: keys,
      bpm,
      scrollSpeed: 15,
      ppqn: 384,
      notes: notes.sort((a, b) => a.tick - b.tick),
      rawRecording: [],
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - (index + 1) * 3600000,
      demo: true,
    };
  }
  async function loadActiveProfile() {
    CF.progress.use(await CF.storage.profile());
    app.settings = {
      bindings: structuredClone(CF.bindings),
      sound: true,
      volume: 0.35,
    };
    const settings = await CF.storage.settings();
    if (settings) {
      Object.assign(app.settings, settings);
      app.settings.bindings = {
        ...structuredClone(CF.bindings),
        ...settings.bindings,
      };
    }
    app.audio.enabled = app.settings.sound;
    app.audio.volume = app.settings.volume;
    app.charts = await CF.storage.all();
    // Upgrade the old starter defaults once; later user speed edits stay intact.
    if (!app.settings.starterSpeed15Applied) {
      for (const chart of app.charts) {
        if (chart.demo && chart.scrollSpeed === 10) {
          chart.scrollSpeed = 15;
          await CF.storage.save(chart);
        }
      }
      app.settings.starterSpeed15Applied = true;
      await CF.storage.saveSettings(app.settings);
    }
    if (!app.settings.initialized) {
      if (!app.charts.length) {
        app.charts = [
          demo("Glass Pattern", 4, 180, 12, 0),
          demo("Midnight Circuit", 6, 140, 16, 1),
          demo("Soft Landing", 4, 100, 8, 2),
        ];
        for (const c of app.charts) await CF.storage.save(c);
      }
      app.settings.initialized = true;
      await CF.storage.saveSettings(app.settings);
    }
  }
  async function flushWorkspace() {
    await flush();
    if (app.pending.size)
      throw Error(
        "Your charts could not be saved. Try again before switching users.",
      );
    await CF.progress.flush();
  }
  CF.workspace = {
    render: setScreen,
    flush: flushWorkspace,
    async leave() {
      if (app.state === "record" && app.session?.raw.length) {
        if (app.session.phase === "running") pause();
        CF.ui.toast(
          "Finish or cancel this recording before opening your profile.",
        );
        return false;
      }
      app.editor?.stop(app.audio);
      app.audio.stop();
      await flushWorkspace();
      app.session = null;
      return true;
    },
    async activate(id) {
      await flushWorkspace();
      for (const timer of app.saveTimers.values()) clearTimeout(timer);
      app.saveTimers.clear();
      await CF.storage.activate(id);
      app.current = null;
      app.editor = null;
      app.session = null;
      await loadActiveProfile();
    },
  };
  async function init() {
    try {
      await CF.storage.open();
      await loadActiveProfile();
      library();
      requestAnimationFrame(frame);
      await CF.guide.firstVisit();
    } catch (error) {
      setScreen(
        "error",
        `${header("Your workspace couldn’t open.", "IndexedDB is unavailable in this browser session.")}<div class="glass form-panel"><p>Allow browser storage and reload. You can also serve this folder through a local static HTTP server.</p><p style="margin-top:15px;color:var(--secondary)">${E(error.message)}</p></div>`,
        "Storage unavailable",
      );
    }
  }
  init();
})();
