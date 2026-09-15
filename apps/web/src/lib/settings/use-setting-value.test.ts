import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSettingsDefaults,
  isDirtyProfileKey,
  isLockedSettingKey,
  resolveSettingStateKey,
  SETTINGS_SOUND_PROFILE_SUFFIX,
  SETTINGS_SOUND_VOLUME_SUFFIX,
  SETTINGS_WRITE_COALESCE_MS,
  SettingsValueStore,
  type SettingsPatch,
  type SettingsScheduler,
} from "@/lib/settings/use-setting-value";
import { SETTINGS_SHARED_ROW_KEYS, walkSettingsRows } from "@/lib/settings/tree";

it("serializes overlapping slider saves so an older response cannot overwrite the latest value", async () => {
  const releases: Array<() => void> = [];
  const writes: SettingsPatch[] = [];
  const store = new SettingsValueStore({
    values: { m2: 15 },
    write: async (patch) => {
      writes.push(patch);
      await new Promise<void>((resolve) => releases.push(resolve));
    },
  });
  store.setValue("m2", 16);
  const first = store.flushPending();
  store.setValue("m2", 20);
  const second = store.flushPending();
  try {
    assert.equal(writes.length, 1);
    releases[0]?.();
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
    assert.deepEqual(writes, [{ m2: 16 }, { m2: 20 }]);
    releases[1]?.();
    await Promise.all([first, second]);
    assert.equal(store.getValue("m2"), 20);
    assert.equal(store.getKeyStatus("m2"), "saved");
  } finally {
    releases.forEach((release) => release());
    store.dispose();
  }
});

it("rolls a failed second slider save back to the first successful save", async () => {
  let release!: () => void;
  let calls = 0;
  const store = new SettingsValueStore({
    values: { m2: 15 },
    write: async () => {
      calls += 1;
      if (calls === 1)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      else throw new Error("offline");
    },
  });
  store.setValue("m2", 16);
  const saved = store.flushPending();
  store.setValue("m2", 20);
  release();
  await assert.rejects(saved);
  assert.equal(store.getValue("m2"), 16);
  store.dispose();
});

it("keeps a profile edit made during saving editable and resettable to the saved name", async () => {
  let release!: () => void;
  const store = new SettingsValueStore({
    values: { pn: "Original" },
    write: () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  });
  store.setValue("pn", "First");
  const saved = store.commitDirtyAndFlush();
  store.setValue("pn", "Second");
  release();
  await saved;
  assert.equal(store.getValue("pn"), "Second");
  assert.equal(store.isDirty(), true);
  assert.equal(store.getStatus(), "saved");
  store.resetDirty();
  assert.equal(store.getValue("pn"), "First");
  store.dispose();
});

/**
 * Ş6 §5 — okuma/yazma köprüsü.
 *
 * Kuyruk, geri alma ve paylaşılan anahtar davranışı React'ten bağımsız bir kutuda durduğu için
 * burada **gerçekten** sınanır: sürükleme tek yamaya iniyor mu, hata değeri geri alıyor mu,
 * uzak olay kendi yazmasını eziyor mu. Kanca tarafı bu kutunun ince bir sarmalayıcısıdır.
 */

/** Zamanlayıcıyı elle ilerletebilen sahte zamanlayıcı. */
function fakeScheduler(): SettingsScheduler & { pending: () => number; run: () => void } {
  const queue: Array<{ callback: () => void; id: number }> = [];
  let nextId = 1;

  return {
    clearTimer: (handle) => {
      const index = queue.findIndex((entry) => entry.id === handle);

      if (index >= 0) queue.splice(index, 1);
    },
    pending: () => queue.length,
    run: () => {
      const entries = queue.splice(0, queue.length);

      for (const entry of entries) entry.callback();
    },
    setTimer: (callback) => {
      const id = nextId++;
      queue.push({ callback, id });

      return id;
    },
  };
}

function makeStore(options: {
  fail?: boolean;
  scheduler: ReturnType<typeof fakeScheduler>;
  values?: SettingsPatch;
}) {
  const patches: SettingsPatch[] = [];
  let fail = options.fail ?? false;

  const store = new SettingsValueStore({
    scheduler: options.scheduler,
    ...(options.values ? { values: options.values } : {}),
    write: async (patch) => {
      patches.push(patch);

      if (fail) {
        throw new Error("PATCH düştü");
      }
    },
  });

  return { patches, setFail: (next: boolean) => (fail = next), store };
}

describe("resolveSettingStateKey — paylaşılan durum", () => {
  it("beş paylaşılan anahtar iki sekmede de aynı duruma bakıyor", () => {
    // Aynı `key` iki sekmede geçtiği için eşleme gerekmiyor; tekliği ağacın kendisi taşıyor.
    for (const key of SETTINGS_SHARED_ROW_KEYS) {
      assert.equal(resolveSettingStateKey(key), key);
    }

    const occurrences = new Map<string, number>();

    for (const { row } of walkSettingsRows()) {
      occurrences.set(row.key, (occurrences.get(row.key) ?? 0) + 1);
    }

    for (const key of SETTINGS_SHARED_ROW_KEYS) {
      assert.equal(occurrences.get(key), 2, `${key} iki kez geçmeli`);
    }
  });

  it("sapma #4'ün iki çifti tek duruma bağlanıyor", () => {
    assert.equal(resolveSettingStateKey("v7"), "reduceMotion");
    for (const key of ["x1", "v8", "x5"]) assert.equal(resolveSettingStateKey(key), key);
  });

  it("`np4` paylaşılan anahtarlardan ayrı kalıyor", () => {
    // Tuzak #4 — panelin `Mesaj içeriğini göster` satırı `na6` değil.
    assert.equal(resolveSettingStateKey("np4"), "np4");
    assert.notEqual(resolveSettingStateKey("np4"), resolveSettingStateKey("na6"));
  });

  it("kilitli ve kirli anahtarlar sayılı listeden geliyor", () => {
    assert.equal(isLockedSettingKey("nt13"), true);
    assert.equal(isLockedSettingKey("nt15"), false);
    assert.equal(isDirtyProfileKey("pbio"), true);
    // Sapma #5 — `p` öneki sezgisi Ses işleme satırlarını da yakalıyordu.
    assert.equal(isDirtyProfileKey("p1"), false);
  });
});

describe("buildSettingsDefaults", () => {
  const defaults = buildSettingsDefaults();

  it("ses satırı üç değer taşıyor", () => {
    assert.equal(defaults["ns1"], true);
    assert.equal(defaults[`ns1${SETTINGS_SOUND_PROFILE_SUFFIX}`], "whispr");
    assert.equal(defaults[`ns1${SETTINGS_SOUND_VOLUME_SUFFIX}`], 60);
    assert.equal(defaults[`ns2${SETTINGS_SOUND_PROFILE_SUFFIX}`], "classic");
  });

  it("metin alanları boş dizeyle başlıyor", () => {
    assert.equal(defaults["pn"], "");
    assert.equal(defaults["pbio"], "");
    assert.equal(defaults.ps, "");
    assert.equal(defaults.pe, "");
  });

  it("kaydırıcı ve menü varsayılanları ağaçtan geliyor", () => {
    assert.equal(defaults["i6"], 120);
    assert.equal(defaults["u3"], 78);
    assert.equal(defaults["pp"], 1);
  });
});

describe("SettingsValueStore — kuyruk", () => {
  it("combined status emoji changes can be discarded before their first save", () => {
    const store = new SettingsValueStore({ write: async () => {} });
    store.setValue("pe", "😀😂");
    store.resetDirty();
    assert.equal(store.getValue("pe"), "");
    store.dispose();
  });
  it("store yeniden kurulmadan güncel writer kullanılıyor", async () => {
    const scheduler = fakeScheduler();
    const first: SettingsPatch[] = [];
    const latest: SettingsPatch[] = [];
    const store = new SettingsValueStore({
      scheduler,
      write: async (patch) => {
        first.push(patch);
      },
    });

    store.setWrite(async (patch) => {
      latest.push(patch);
    });
    store.setValue("u3", 40);
    scheduler.run();
    await Promise.resolve();

    assert.deepEqual(first, []);
    assert.deepEqual(latest, [{ u3: 40 }]);
  });

  it("250 ms içindeki 40 yazma tek yamaya iniyor", () => {
    const scheduler = fakeScheduler();
    const { patches, store } = makeStore({ scheduler });

    for (let step = 0; step < 40; step += 1) {
      store.setValue("u3", step);
    }

    assert.equal(patches.length, 0, "zamanlayıcı dolmadan istek çıkmamalı");
    assert.equal(scheduler.pending(), 1, "tek zamanlayıcı kurulmalı");

    scheduler.run();

    assert.equal(patches.length, 1);
    assert.deepEqual(patches[0], { u3: 39 });
  });

  it("aynı yamada farklı anahtarlar birleşiyor", () => {
    const scheduler = fakeScheduler();
    const { patches, store } = makeStore({ scheduler });

    store.setValue("nq1", false);
    store.setValue("u3", 40);
    scheduler.run();

    assert.deepEqual(patches, [{ nq1: false, u3: 40 }]);
  });

  it("gecikme sözleşmesi 250 ms", () => {
    assert.equal(SETTINGS_WRITE_COALESCE_MS, 250);
  });

  it("değer değişmediğinde istek çıkmıyor", () => {
    const scheduler = fakeScheduler();
    const { patches, store } = makeStore({ scheduler });

    store.setValue("nq1", true);
    scheduler.run();

    assert.deepEqual(patches, []);
  });

  it("kilitli anahtar PATCH'e hiç girmiyor", () => {
    const scheduler = fakeScheduler();
    const { patches, store } = makeStore({ scheduler });

    store.setValue("nt13", false);
    scheduler.run();

    assert.deepEqual(patches, []);
    assert.equal(store.getValue("nt13"), true);
  });
});

describe("SettingsValueStore — durum ve geri alma", () => {
  it("başarılı yazma `saved`, hatalı yazma `error` bırakıyor", async () => {
    const scheduler = fakeScheduler();
    const { setFail, store } = makeStore({ scheduler });

    store.setValue("u3", 40);
    assert.equal(store.getKeyStatus("u3"), "saving");
    assert.equal(store.getStatus(), "saving");

    scheduler.run();
    await store.flushPending();

    assert.equal(store.getKeyStatus("u3"), "saved");
    assert.equal(store.getStatus(), "saved");

    setFail(true);
    store.setValue("u3", 55);
    scheduler.run();
    await assert.rejects(store.flushPending());

    assert.equal(store.getKeyStatus("u3"), "error");
    assert.equal(store.getStatus(), "error");
  });

  it("hata değeri sunucunun bildiği hâle geri alıyor", async () => {
    const scheduler = fakeScheduler();
    const { store } = makeStore({ fail: true, scheduler });

    assert.equal(store.getValue("u3"), 78);
    store.setValue("u3", 12);
    assert.equal(store.getValue("u3"), 12, "iyimser değer hemen görünmeli");

    scheduler.run();
    await Promise.resolve();

    assert.equal(store.getValue("u3"), 78, "hata eski değeri geri getirmeli");
  });

  it("uçuştaki yama düşse de arada gelen yeni değer korunuyor", async () => {
    const scheduler = fakeScheduler();
    const { store } = makeStore({ fail: true, scheduler });

    store.setValue("u3", 12);
    scheduler.run();
    store.setValue("u3", 33);
    await Promise.resolve();

    assert.equal(store.getValue("u3"), 33);
  });

  it("`retry` düşen yamayı olduğu gibi tekrar gönderiyor", async () => {
    const scheduler = fakeScheduler();
    const { patches, setFail, store } = makeStore({ fail: true, scheduler });

    store.setValue("u3", 12);
    scheduler.run();
    await Promise.resolve();
    assert.equal(store.getValue("u3"), 78);

    setFail(false);
    store.retry();
    scheduler.run();
    await store.flushPending();

    assert.deepEqual(patches, [{ u3: 12 }, { u3: 12 }]);
    assert.equal(store.getValue("u3"), 12);
    assert.equal(store.getKeyStatus("u3"), "saved");
  });

  it("abonelere haber veriyor", () => {
    const scheduler = fakeScheduler();
    const { store } = makeStore({ scheduler });
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });

    store.setValue("u3", 40);
    assert.equal(calls, 1);

    unsubscribe();
    store.setValue("u3", 41);
    assert.equal(calls, 1);
  });
});

describe("SettingsValueStore — kirli profil alanları", () => {
  it("profil alanı dokununca kaydetmiyor, kirli bayrağı kuruyor", () => {
    const scheduler = fakeScheduler();
    const { patches, store } = makeStore({ scheduler });

    store.setValue("pn", "Doğukan");
    scheduler.run();

    assert.deepEqual(patches, []);
    assert.deepEqual(store.getDirtyKeys(), ["pn"]);
    assert.equal(store.isDirty(), true);
    assert.equal(store.getValue("pn"), "Doğukan");
  });

  it("`commitDirty` kirli alanları tek yamada gönderiyor", () => {
    const scheduler = fakeScheduler();
    const { patches, store } = makeStore({ scheduler });

    store.setValue("pn", "Doğukan");
    store.setValue("pbio", "o/onun");
    store.commitDirty();
    scheduler.run();

    assert.deepEqual(patches, [{ pn: "Doğukan", pbio: "o/onun" }]);
    assert.equal(store.isDirty(), false);
  });

  it("`resetDirty` taslağı sunucunun bildiği hâle döndürüyor", () => {
    const scheduler = fakeScheduler();
    const { patches, store } = makeStore({ scheduler, values: { pn: "Eski" } });

    store.setValue("pn", "Yeni");
    store.resetDirty();
    scheduler.run();

    assert.equal(store.getValue("pn"), "Eski");
    assert.equal(store.isDirty(), false);
    assert.deepEqual(patches, []);
  });
});

describe("SettingsValueStore — `settings.updated`", () => {
  it("uzak değer sessizce hizalıyor", () => {
    const scheduler = fakeScheduler();
    const { store } = makeStore({ scheduler });

    store.applyRemote({ u3: 90 });

    assert.equal(store.getValue("u3"), 90);
    assert.equal(store.getKeyStatus("u3"), "idle", "uzak hizalama kayıt göstergesini kıpırdatmaz");
  });

  it("kendi yazması uçuştayken uzak değeri yutuyor", async () => {
    const scheduler = fakeScheduler();
    const { store } = makeStore({ scheduler });

    store.setValue("u3", 12);
    store.applyRemote({ u3: 90 });
    assert.equal(store.getValue("u3"), 12, "kuyruktaki değer ezilmemeli");

    scheduler.run();
    store.applyRemote({ u3: 91 });
    assert.equal(store.getValue("u3"), 12, "uçuştaki değer de ezilmemeli");

    await Promise.resolve();
    store.applyRemote({ u3: 92 });
    assert.equal(store.getValue("u3"), 92, "yama oturduktan sonra hizalanmalı");
  });

  it("kirli profil alanını ezmiyor", () => {
    const scheduler = fakeScheduler();
    const { store } = makeStore({ scheduler });

    store.setValue("pn", "Taslak");
    store.applyRemote({ pn: "Sunucu" });

    assert.equal(store.getValue("pn"), "Taslak");
  });

  it("`stateKey` üzerinden gelen uzak değer iki satırı birden hizalıyor", () => {
    const scheduler = fakeScheduler();
    const { store } = makeStore({ scheduler });

    store.applyRemote({ v7: true });

    assert.equal(store.getValue("reduceMotion"), true);
  });
});

describe("SettingsValueStore — flush", () => {
  it("`flush` zamanlayıcıyı beklemiyor", async () => {
    const scheduler = fakeScheduler();
    const { patches, store } = makeStore({ scheduler });

    store.setValue("u3", 40);
    store.flush();
    await Promise.resolve();

    assert.deepEqual(patches, [{ u3: 40 }]);
    assert.equal(scheduler.pending(), 0, "zamanlayıcı iptal edilmeli");
  });
});
