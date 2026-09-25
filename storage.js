"use strict";
CF.storage = {
  profileId: "local-player",
  async open() {
    this.db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("chartflow", 2);
      r.onupgradeneeded = () => {
        const db = r.result,
          tx = r.transaction;
        const charts = db.objectStoreNames.contains("charts")
          ? tx.objectStore("charts")
          : db.createObjectStore("charts", { keyPath: "id" });
        const settings = db.objectStoreNames.contains("settings")
          ? tx.objectStore("settings")
          : db.createObjectStore("settings");
        if (!charts.indexNames.contains("ownerId"))
          charts.createIndex("ownerId", "ownerId");
        db.createObjectStore("profiles", { keyPath: "id" }).put({
          id: "local-player",
          name: "Player",
          createdAt: Date.now(),
          stats: {},
          unlocked: {},
          history: [],
        });
        const slots = db.createObjectStore("saves", { keyPath: "id" });
        slots.createIndex("ownerId", "ownerId");
        settings.put("local-player", "activeProfile");
        const old = settings.get("preferences");
        old.onsuccess = () => {
          if (old.result) settings.put(old.result, "preferences:local-player");
        };
        const cursor = charts.openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (c) {
            c.update({ ...c.value, ownerId: "local-player" });
            c.continue();
          }
        };
      };
      r.onsuccess = () => {
        r.result.onversionchange = () => r.result.close();
        resolve(r.result);
      };
      r.onerror = () => reject(r.error);
      r.onblocked = () =>
        CF.ui.toast(
          "Close other ChartFlow tabs to finish upgrading your saves.",
        );
    });
    this.profileId =
      (await this.request("settings", "readonly", (s) =>
        s.get("activeProfile"),
      )) || "local-player";
  },
  request(store, mode, operation) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, mode),
        r = operation(tx.objectStore(store));
      tx.oncomplete = () => resolve(r.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || new Error("Storage transaction interrupted."));
    });
  },
  all() {
    return this.request("charts", "readonly", (s) =>
      s.index("ownerId").getAll(this.profileId),
    );
  },
  save(chart) {
    const value = {
      ...structuredClone(chart),
      ownerId: chart.ownerId || this.profileId,
    };
    return this.request("charts", "readwrite", (s) => s.put(value));
  },
  remove(id) {
    return this.request("charts", "readwrite", (s) => s.delete(id));
  },
  settings() {
    return this.request("settings", "readonly", (s) =>
      s.get("preferences:" + this.profileId),
    );
  },
  saveSettings(value) {
    return this.request("settings", "readwrite", (s) =>
      s.put(value, "preferences:" + this.profileId),
    );
  },
  profiles() {
    return this.request("profiles", "readonly", (s) => s.getAll());
  },
  profile() {
    return this.request("profiles", "readonly", (s) => s.get(this.profileId));
  },
  saveProfile(profile) {
    return this.request("profiles", "readwrite", (s) =>
      s.put(structuredClone(profile)),
    );
  },
  async activate(id) {
    const p = await this.request("profiles", "readonly", (s) => s.get(id));
    if (!p) throw Error("User not found.");
    await this.request("settings", "readwrite", (s) =>
      s.put(id, "activeProfile"),
    );
    this.profileId = id;
  },
  slots() {
    return this.request("saves", "readonly", (s) =>
      s.index("ownerId").getAll(this.profileId),
    );
  },
  saveSlot(slot) {
    return this.request("saves", "readwrite", (s) => s.put(slot));
  },
  deleteSlot(id) {
    return this.request("saves", "readwrite", (s) => s.delete(id));
  },
  async bundle() {
    const [profile, charts, settings] = await Promise.all([
      this.profile(),
      this.all(),
      this.settings(),
    ]);
    return {
      format: "chartflow-save",
      version: 1,
      savedAt: Date.now(),
      profile,
      charts,
      settings,
    };
  },
  // Restoring a save replaces charts, preferences and progress together.
  replace(bundle, id, replaceExisting = false) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(
          ["charts", "profiles", "settings"],
          "readwrite",
        ),
        charts = tx.objectStore("charts");
      const write = () => {
        for (const c of bundle.charts) charts.put({ ...c, ownerId: id });
        tx.objectStore("profiles").put({ ...bundle.profile, id });
        tx.objectStore("settings").put(bundle.settings, "preferences:" + id);
      };
      if (replaceExisting) {
        const cursor = charts.index("ownerId").openCursor(IDBKeyRange.only(id));
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (c) {
            c.delete();
            c.continue();
          } else write();
        };
      } else write();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || new Error("Save restore interrupted."));
    });
  },
};
