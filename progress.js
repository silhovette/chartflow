"use strict";
CF.progress = {
  catalogue: [
    [
      "first-chart",
      "First spark",
      "Create your first original chart.",
      "created",
      1,
      "✦",
    ],
    [
      "five-charts",
      "Pattern maker",
      "Create 5 original charts.",
      "created",
      5,
      "▦",
    ],
    [
      "first-record",
      "In the moment",
      "Finish a recording with at least one input.",
      "recorded",
      1,
      "●",
    ],
    ["editor-25", "Fine-tuned", "Make 25 note edits.", "edits", 25, "⌘"],
    [
      "first-play",
      "Into the flow",
      "Finish your first full chart.",
      "plays",
      1,
      "▷",
    ],
    ["plays-10", "One more time", "Finish 10 full charts.", "plays", 10, "↻"],
    ["combo-25", "Connected", "Reach a 100-note combo.", "bestCombo", 100, "◇"],
    ["combo-100", "Unbroken", "Reach a 500-note combo.", "bestCombo", 500, "◈"],
    [
      "precision",
      "Crystal clear",
      "Reach 95% accuracy on a chart with 20+ notes.",
      "precise",
      1,
      "◎",
    ],
    [
      "full-combo",
      "No note behind",
      "Hit every note in a chart with 100+ notes.",
      "fullCombos",
      1,
      "✧",
    ],
    [
      "perfect",
      "Pure signal",
      "All Perfect on a chart with 100+ notes.",
      "perfects",
      1,
      "✺",
    ],
    [
      "eight-lanes",
      "Eight-way flow",
      "Finish an 8K chart with 100+ notes and 80% accuracy.",
      "eightKey",
      1,
      "Ⅷ",
    ],
    [
      "thousand",
      "A thousand pulses",
      "Hit 1,000 notes across full chart runs.",
      "hits",
      1000,
      "≋",
    ],
  ],
  pending: Promise.resolve(),
  queued: new Map(),
  use(profile) {
    this.profile = profile;
    profile.stats ||= {};
    profile.unlocked ||= {};
    profile.history ||= [];
    this.updateBadge();
  },
  updateBadge() {
    const p = this.profile;
    if (!p) return;
    document.querySelector("#user-name").textContent = p.name;
    const avatar = document.querySelector("#user-avatar");
    const src = this.avatarSource(p.avatar);
    const currentImage = avatar.querySelector("img");
    if (src ? currentImage?.getAttribute("src") !== src :
        currentImage || avatar.textContent !== p.name.slice(0, 1).toUpperCase()) {
      avatar.innerHTML = this.avatarMarkup(p);
    }
    avatar.classList.toggle("has-image", !!src);
    document.querySelector(".user-chip").classList.toggle(
      "all-achievements", this.catalogue.every(([id]) => !!p.unlocked[id]),
    );
  },
  avatarSource(value) {
    if (typeof value !== "string") {
      this.checkedAvatar = this.checkedAvatarSource = undefined;
      return "";
    }
    if (this.checkedAvatar === value) return this.checkedAvatarSource;
    const limit = value.startsWith("data:image/gif;base64,")
      ? 22 + 4 * Math.ceil(5 * 1024 * 1024 / 3) : 1024 * 1024;
    const source = value.length <= limit &&
      /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value) ? value : "";
    this.checkedAvatar = source ? value : undefined;
    this.checkedAvatarSource = source;
    return source;
  },
  avatarMarkup(profile) {
    const src = this.avatarSource(profile.avatar);
    return src ? `<img src="${src}" alt="" />` : CF.ui.escape(profile.name.slice(0, 1).toUpperCase());
  },
  event(type, amount = 1) {
    const p = this.profile;
    if (!p) return;
    p.stats[type] = (p.stats[type] || 0) + amount;
    return this.save();
  },
  save() {
    const p = this.profile,
      earned = [];
    for (const [id, name, , key, target] of this.catalogue)
      if (!p.unlocked[id] && (p.stats[key] || 0) >= target) {
        p.unlocked[id] = Date.now();
        earned.push(name);
      }
    // Completed sessions and their history arrays are immutable. Edits only
    // change stats, so share history and the potentially multi-MB avatar.
    const snapshot = {
      ...structuredClone({ ...p, avatar: undefined, history: undefined }),
      avatar: p.avatar, history: p.history,
    };
    this.updateBadge();
    let entry = this.queued.get(p.id);
    if (entry) entry.snapshot = snapshot;
    else {
      entry = { snapshot };
      this.queued.set(p.id, entry);
      entry.promise = this.pending.catch(() => {}).then(() => {
        this.queued.delete(p.id);
        return CF.storage.saveProfile(entry.snapshot);
      });
      this.pending = entry.promise;
    }
    entry.promise
      .then(() => {
        if (earned.length)
          CF.ui.toast("Achievement unlocked · " + earned.join(" · "));
      })
      .catch(() =>
        CF.ui.toast("Progress could not be saved. Try exporting your save."),
      );
    return entry.promise;
  },
  complete(chart, session, accuracy, grade, testing) {
    if (
      testing ||
      session.startTick !== 0 ||
      !session.notes.length ||
      session.progressSaved
    )
      return;
    session.progressSaved = true;
    const p = this.profile,
      s = p.stats,
      n = session.notes.length,
      hits = n - session.counts.Miss;
    s.plays = (s.plays || 0) + 1;
    s.hits = (s.hits || 0) + hits;
    s.bestCombo = Math.max(s.bestCombo || 0, session.maxCombo);
    s.bestAccuracy = Math.max(s.bestAccuracy || 0, accuracy);
    if (n >= 20 && accuracy >= 95) s.precise = (s.precise || 0) + 1;
    if (n >= 100) {
      if (session.counts.Miss === 0) s.fullCombos = (s.fullCombos || 0) + 1;
      if (session.counts.Perfect === n) s.perfects = (s.perfects || 0) + 1;
      if (chart.keyCount === 8 && accuracy >= 80)
        s.eightKey = (s.eightKey || 0) + 1;
    }
    p.history = [{
      id: CF.id(),
      chartId: chart.id,
      name: chart.name,
      keyCount: chart.keyCount,
      accuracy,
      grade,
      combo: session.maxCombo,
      score: Math.round(session.weight * 1000),
      notes: n,
      counts: { ...session.counts },
      at: Date.now(),
    }, ...p.history.slice(0, 199)];
    this.save();
  },
  async flush() {
    await this.pending;
  },
};
