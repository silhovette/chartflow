"use strict";
CF.account = {
  panel: "achievements",
  sessionRows(records) {
    const E = CF.ui.escape;
    const chartIds = new Set(CF.app.charts.map((chart) => chart.id));
    return records.map((r) => `<article class="glass session-row"><span class="session-grade">${E(r.grade)}</span><div><strong>${E(r.name)}</strong>${chartIds.has(r.chartId) ? "" : '<small class="session-deleted">deleted</small>'}<small>${r.keyCount}K · ${new Date(r.at).toLocaleString()}</small></div><span>${r.accuracy.toFixed(2)}%<small>Accuracy</small></span><span>${r.combo}<small>Max combo</small></span><span>${r.score.toLocaleString()}<small>Score</small></span></article>`).join("");
  },
  showMoreSessions() {
    const list = document.querySelector("#recent-sessions");
    if (!list) return;
    const count = list.children.length;
    const records = CF.progress.profile.history.slice(count, count + 10);
    list.insertAdjacentHTML("beforeend", this.sessionRows(records));
    const added = [...list.children].slice(count);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      added.forEach((row, index) => row.animate([
        { opacity: 0, transform: "translateY(10px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], { duration: 350, delay: index * 30, easing: "ease-out", fill: "backwards" }));
    }
    if (list.children.length >= CF.progress.profile.history.length) {
      document.querySelector(".sessions-more")?.remove();
      if (added[0]) {
        added[0].tabIndex = -1;
        added[0].focus({ preventScroll: true });
      }
    }
  },
  async resetAvatar() {
    delete CF.progress.profile.avatar;
    await CF.progress.save();
    await this.show();
    CF.ui.toast("Avatar reset");
  },
  changeAvatar() {
    const profile = CF.progress.profile;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.id = "avatar-upload";
    input.hidden = true;
    document.querySelector("#avatar-upload")?.remove();
    document.body.append(input);
    input.oncancel = () => input.remove();
    input.onchange = async () => {
      let bitmap;
      try {
        const file = input.files[0];
        if (!file) return;
        const signature = await file.slice(0, 6).text();
        const isGif = signature === "GIF87a" || signature === "GIF89a";
        if (isGif && file.size > 5 * 1024 * 1024) {
          CF.ui.toast("Choose a GIF smaller than 5 MB.");
          return;
        }
        bitmap = await createImageBitmap(file);
        if (isGif) {
          // Preserve every frame and its timing; canvas would flatten the GIF.
          profile.avatar = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(new Blob([file], { type: "image/gif" }));
          });
        } else {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 256;
          const size = Math.min(bitmap.width, bitmap.height);
          canvas.getContext("2d").drawImage(bitmap,
            (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size,
            0, 0, 256, 256);
          profile.avatar = canvas.toDataURL("image/png");
        }
        if (CF.progress.profile === profile) {
          await CF.progress.save();
          if (CF.app.state === "account") await this.show();
        } else await CF.storage.saveProfile(profile);
        CF.ui.toast("Avatar updated");
      } catch (error) {
        CF.ui.toast("Could not save this image. Try another image.");
      } finally {
        bitmap?.close();
        input.remove();
      }
    };
    input.click();
  },
  async show(panel = this.panel) {
    if (!(await CF.workspace.leave())) return;
    this.panel = panel;
    const E = CF.ui.escape,
      p = CF.progress.profile,
      s = p.stats,
      [profiles, slots] = await Promise.all([
        CF.storage.profileOptions(),
        panel === "saves" ? CF.storage.slotSummaries() : [],
      ]);
    const unlocked = CF.progress.catalogue.filter(([id]) => p.unlocked[id]).length;
    const button = (label, action, extra = "") =>
      `<button class="button small" data-account="${action}" ${extra}>${label}</button>`;
    let content = "";
    if (panel === "overview")
      content = `<div class="section-bar"><h3>Recent sessions</h3><small>Up to latest 200</small></div><div class="session-list" id="recent-sessions">${p.history.length ? this.sessionRows(p.history.slice(0, 10)) : '<div class="glass empty-state"><h2>Your next chapter starts here.</h2><p>Play a full chart to save your score and work toward achievements.</p><button class="button primary" data-action="library">Explore your charts →</button></div>'}</div>${p.history.length > 10 ? '<div class="sessions-more"><button class="button small" data-account="more-sessions" aria-controls="recent-sessions">Show 10 more</button></div>' : ''}`;

    if (panel === "achievements")
      content = `<p class="account-note">Achievements belong to this user. Gameplay achievements count full runs from the start; editor tests and previews are practice.</p><div class="achievement-grid">${CF.progress.catalogue
        .map(([id, name, description, key, target, icon]) => {
          const earned = p.unlocked[id],
            value = Math.min(target, s[key] || 0);
          return `<article class="glass achievement ${earned ? "earned" : ""}"><div class="achievement-icon">${icon}</div><div><h3>${E(name)}${earned ? "<span>✓</span>" : ""}</h3><p>${E(description)}</p><progress value="${value}" max="${target}" aria-label="${E(name)} progress"></progress><small>${earned ? "Unlocked " + new Date(earned).toLocaleDateString() : `${value.toLocaleString()} / ${target.toLocaleString()}`}</small></div></article>`;
        })
        .join("")}</div>`;
    if (panel === "saves")
      content = `<section class="glass saves-intro"><div><h3>Keep a moment of your workspace.</h3><p>A named save includes your charts, raw recordings, preferences, play history and achievements.</p></div><div class="actions">${button("＋ Create save", "save")}${button("↧ Export full save", "export")}${button("↥ Import full save", "import")}</div></section><div class="section-bar"><h3>Named saves <span class="pill">${slots.length}</span></h3><small>Automatic saving is always on</small></div><div class="session-list">${
        slots
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(
            (slot) =>
              `<article class="glass save-row"><div><h3>${E(slot.name)}</h3><small>${new Date(slot.createdAt).toLocaleString()} · ${slot.charts} charts · ${slot.plays} sessions</small></div><div class="actions">${button("Restore", "restore", `data-id="${slot.id}"`)}${button("Delete", "delete-save", `data-id="${slot.id}"`)}</div></article>`,
          )
          .join("") ||
        '<div class="glass empty-state"><h3>No named saves yet.</h3><p>Create one before experimenting with your charts.</p></div>'
      }</div><p class="account-note">Exports are portable JSON files. Import creates a separate local user. Named saves stay in this browser; export a copy to keep it outside the browser.</p>`;
    CF.workspace.render(
      "account",
      `<div class="page-heading"><div><div class="eyebrow">YOUR LOCAL PROFILE</div><h1>${E(p.name)}</h1><p>Your rhythms, milestones, and saved moments.</p></div><div class="actions profile-actions"><select id="profile-switch" aria-label="Switch user">${profiles.map((u) => `<option value="${u.id}" ${u.id === p.id ? "selected" : ""}>${E(u.name)}</option>`).join("")}</select>${button("＋ New user", "new-user")}${button("Rename", "rename-user")}</div></div><section class="glass profile-summary"><button type="button" class="profile-monogram ${CF.progress.avatarSource(p.avatar) ? "has-image" : ""}" popovertarget="avatar-options" aria-label="Avatar options">${CF.progress.avatarMarkup(p)}</button><div id="avatar-options" popover="auto"><button type="button" data-account="avatar">Change avatar</button><button type="button" data-account="reset-avatar">Reset avatar</button></div><div class="stat-grid"><div class="stat"><strong>${s.plays || 0}</strong><small>Sessions completed</small></div><div class="stat"><strong>${s.bestCombo || 0}</strong><small>Best combo</small></div><div class="stat"><strong>${(s.bestAccuracy || 0).toFixed(2)}%</strong><small>Best accuracy</small></div><div class="stat"><strong>${unlocked}<em> / ${CF.progress.catalogue.length}</em></strong><small>Achievements</small></div></div></section><nav class="account-tabs" aria-label="Profile sections">${[
        ["achievements", "Achievements"],
        ["overview", "Overview"],
        ["saves", "Save manager"],
      ]
        .map(
          ([key, name]) =>
            `<button data-account="tab" data-panel="${key}" class="${panel === key ? "active" : ""}" aria-pressed="${panel === key}">${name}</button>`,
        )
        .join("")}</nav>${content}`,
      "Profile / " + p.name,
    );
    const avatarButton = document.querySelector('[popovertarget="avatar-options"]');
    let avatarPoint;
    avatarButton.addEventListener("click", (event) => {
      avatarPoint = event.detail > 0 ? { x: event.clientX, y: event.clientY } : null;
    });
    document.querySelector("#avatar-options").addEventListener("beforetoggle", (event) => {
      if (event.newState !== "open") return;
      const rect = avatarButton.getBoundingClientRect();
      event.target.style.left = Math.max(8, Math.min((avatarPoint?.x ?? rect.right) + 10, innerWidth - 168)) + "px";
      event.target.style.top = Math.max(8, Math.min((avatarPoint?.y ?? rect.bottom) + 10, innerHeight - 94)) + "px";
    });
    document.querySelector("#profile-switch").onchange = async (e) => {
      try {
        await CF.workspace.activate(e.target.value);
        await this.show();
      } catch (err) {
        CF.ui.toast(err.message);
      }
    };
  },
  async newUser() {
    const answer = await CF.ui.dialog({
      title: "Create a local user",
      body: '<label class="field">Display name<input name="name" maxlength="32" placeholder="Your name" required></label><p>Each user has their own charts, settings and achievements on this device.</p>',
      confirm: "Create user",
    });
    if (!answer) return;
    const name = answer.name.trim();
    if (!name) return CF.ui.toast("Enter a display name.");
    const p = {
      id: CF.id(),
      name,
      createdAt: Date.now(),
      stats: {},
      unlocked: {},
      history: [],
    };
    await CF.storage.replace(
      {
        profile: p,
        charts: [],
        settings: {
          initialized: true,
          bindings: structuredClone(CF.bindings),
          sound: true,
          volume: 0.35,
          musicVolume: 1,
        },
      },
      p.id,
    );
    await CF.workspace.activate(p.id);
    await this.show("overview");
  },
  async rename() {
    const p = CF.progress.profile,
      answer = await CF.ui.dialog({
        title: "Rename user",
        body: `<label class="field">Display name<input name="name" value="${CF.ui.escape(p.name)}" maxlength="32" required></label>`,
        confirm: "Save name",
      });
    if (!answer) return;
    if (!answer.name.trim()) return CF.ui.toast("Enter a display name.");
    p.name = answer.name.trim();
    await CF.progress.save();
    CF.progress.updateBadge();
    await this.show();
  },
  async createSave() {
    const answer = await CF.ui.dialog({
      title: "Save your workspace",
      body: '<label class="field">Save name<input name="name" maxlength="80" placeholder="Before the next experiment" required></label>',
      confirm: "Create save",
    });
    if (!answer) return;
    if (!answer.name.trim()) return CF.ui.toast("Enter a save name.");
    await CF.workspace.flush();
    const bundle = await CF.storage.bundle();
    await CF.storage.saveSlot({
      id: CF.id(),
      ownerId: CF.storage.profileId,
      name: answer.name.trim(),
      createdAt: Date.now(),
      bundle,
    });
    await this.show("saves");
    CF.ui.toast("Workspace save created");
  },
  async restore(id) {
    const slot = await CF.storage.slot(id);
    if (!slot) return;
    const yes = await CF.ui.dialog({
      title: "Restore this save?",
      body: `Restore “${CF.ui.escape(slot.name)}”? This replaces this user's current charts, settings, history and achievements with the saved version. Other users and named saves stay available.`,
      confirm: "Restore save",
      danger: true,
    });
    if (!yes) return;
    await CF.workspace.flush();
    await CF.storage.replace(slot.bundle, CF.storage.profileId, true);
    await CF.workspace.activate(CF.storage.profileId);
    await this.show("saves");
    CF.ui.toast("Workspace restored");
  },
  async deleteSave(id) {
    const slot = await CF.storage.slot(id);
    if (!slot) return;
    const yes = await CF.ui.dialog({
      title: "Delete this save?",
      body: `Remove “${CF.ui.escape(slot.name)}”? Your current workspace is kept.`,
      confirm: "Delete save",
      danger: true,
    });
    if (!yes) return;
    await CF.storage.deleteSlot(id);
    await this.show("saves");
  },
  async export() {
    await CF.workspace.flush();
    const bundle = await CF.storage.bundle(),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(bundle, null, 2)], {
          type: "application/json",
        }),
      );
    const a = document.createElement("a");
    a.href = url;
    a.download =
      (bundle.profile.name.replace(/[^a-z0-9\u3400-\u9fff]+/gi, "-") ||
        "player") + ".chartflow-save.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  parse(data) {
    if (
      data?.format !== "chartflow-save" ||
      data.version !== 1 ||
      !data.profile ||
      !Array.isArray(data.charts) ||
      data.charts.length > 2000
    )
      throw Error("Choose a ChartFlow full-save JSON file.");
    const source = data.profile;
    if (
      typeof source.name !== "string" ||
      !source.name.trim() ||
      source.name.length > 32 ||
      !Array.isArray(source.history) ||
      source.history.length > 200
    )
      throw Error("The user profile is invalid.");
    const ids = new Map(),
      charts = data.charts.map((c) => {
        if (!c.id || ids.has(c.id))
          throw Error("The save contains duplicate chart IDs.");
        const copy = CF.validate(c);
        ids.set(c.id, copy.id);
        copy.createdAt = Number.isFinite(c.createdAt)
          ? c.createdAt
          : copy.createdAt;
        copy.updatedAt = Number.isFinite(c.updatedAt)
          ? c.updatedAt
          : copy.updatedAt;
        copy.demo = c.demo === true;
        return copy;
      });
    const stats = {};
    for (const key of new Set([
      ...CF.progress.catalogue.map((a) => a[3]),
      "bestAccuracy",
    ])) {
      const value = source.stats?.[key] ?? 0;
      if (
        !Number.isFinite(value) ||
        value < 0 ||
        value > Number.MAX_SAFE_INTEGER
      )
        throw Error("The progress data is invalid.");
      stats[key] = value;
    }
    if (stats.bestAccuracy > 100) throw Error("The accuracy data is invalid.");
    const unlocked = {};
    for (const [id, , , key, target] of CF.progress.catalogue) {
      const at = source.unlocked?.[id];
      if (Number.isFinite(at) && at > 0 && stats[key] >= target)
        unlocked[id] = at;
    }
    const history = source.history.map((r) => {
      if (
        !r ||
        typeof r.name !== "string" ||
        r.name.length > 120 ||
        ![4, 5, 6, 7, 8].includes(r.keyCount) ||
        !["S", "A", "B", "C", "D"].includes(r.grade)
      )
        throw Error("The play history is invalid.");
      for (const key of ["accuracy", "combo", "score", "notes", "at"])
        if (!Number.isFinite(r[key]) || r[key] < 0)
          throw Error("The play history is invalid.");
      if (r.accuracy > 100 || r.combo > r.notes)
        throw Error("The play history is invalid.");
      const counts = {};
      for (const key of ["Perfect", "Great", "Good", "Miss"]) {
        const n = r.counts?.[key];
        if (!Number.isSafeInteger(n) || n < 0)
          throw Error("The judgement history is invalid.");
        counts[key] = n;
      }
      return {
        id: CF.id(),
        chartId: ids.get(r.chartId) || "",
        name: r.name,
        keyCount: r.keyCount,
        accuracy: r.accuracy,
        grade: r.grade,
        combo: r.combo,
        score: r.score,
        notes: r.notes,
        at: r.at,
        counts,
      };
    });
    const settings = {
      initialized: true,
      starterSpeed15Applied: data.settings?.starterSpeed15Applied === true,
      sound: data.settings?.sound !== false,
      volume: 0.35,
      musicVolume: 1,
      bindings: structuredClone(CF.bindings),
    };
    if (
      Number.isFinite(data.settings?.volume) &&
      data.settings.volume >= 0 &&
      data.settings.volume <= 1
    )
      settings.volume = data.settings.volume;
    if (
      Number.isFinite(data.settings?.musicVolume) &&
      data.settings.musicVolume >= 0 &&
      data.settings.musicVolume <= 1
    )
      settings.musicVolume = data.settings.musicVolume;
    for (const mode of [4, 5, 6, 7, 8]) {
      const keys = data.settings?.bindings?.[mode];
      if (keys === undefined) continue;
      if (
        !Array.isArray(keys) ||
        keys.length !== mode ||
        new Set(keys).size !== mode ||
        keys.some((k) => typeof k !== "string" || !/^[a-oq-z0-9;]$/.test(k))
      )
        throw Error("The key bindings in this save are invalid.");
      settings.bindings[mode] = keys;
    }
    return {
      profile: {
        id: CF.id(),
        name: source.name.trim(),
        avatar: CF.progress.avatarSource(source.avatar),
        createdAt: Date.now(),
        stats,
        unlocked,
        history,
      },
      charts,
      settings,
    };
  },
  import() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.id = "save-import";
    input.hidden = true;
    document.querySelector("#save-import")?.remove();
    document.body.append(input);
    input.onchange = async () => {
      try {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 50 * 1024 * 1024)
          throw Error("Choose a save smaller than 50 MB.");
        const data = this.parse(JSON.parse(await file.text()));
        await CF.workspace.flush();
        await CF.storage.replace(data, data.profile.id);
        await CF.workspace.activate(data.profile.id);
        await this.show("overview");
        CF.ui.toast("Save imported as a separate user");
      } catch (e) {
        CF.ui.toast(e.message);
      } finally {
        input.remove();
      }
    };
    input.click();
  },
};
document.addEventListener("keydown", (e) => {
  const menu = document.querySelector("#avatar-options:popover-open");
  if (e.key !== "Escape" || !menu) return;
  e.preventDefault();
  e.stopPropagation();
  menu.hidePopover();
  document.querySelector('[popovertarget="avatar-options"]')?.focus();
}, true);

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-account]");
  if (!el) return;
  e.preventDefault();
  try {
    const a = el.dataset.account;
    if (a === "more-sessions") CF.account.showMoreSessions();
    else if (a === "tab") await CF.account.show(el.dataset.panel);
    else if (a === "new-user") await CF.account.newUser();
    else if (a === "avatar") {
      document.querySelector("#avatar-options").hidePopover();
      CF.account.changeAvatar();
    }
    else if (a === "reset-avatar") await CF.account.resetAvatar();
    else if (a === "rename-user") await CF.account.rename();
    else if (a === "save") await CF.account.createSave();
    else if (a === "export") await CF.account.export();
    else if (a === "import") CF.account.import();
    else if (a === "restore") await CF.account.restore(el.dataset.id);
    else if (a === "delete-save") await CF.account.deleteSave(el.dataset.id);
  } catch (err) {
    CF.ui.toast(err.message || "This action could not be completed.");
  }
});
