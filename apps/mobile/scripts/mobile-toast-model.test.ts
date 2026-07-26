import assert from "node:assert/strict";
import test from "node:test";

import { darkTheme, lightTheme } from "../src/design/themes";
import {
  MOBILE_TOAST_ACTION_DURATION_MS,
  MOBILE_TOAST_DEFAULT_DURATION_MS,
  MOBILE_TOAST_MAX_DURATION_MS,
  MOBILE_TOAST_MIN_DURATION_MS,
  MOBILE_TOAST_TONE_VARIANTS,
  MOBILE_TOAST_VARIANT_ICONS,
  createMobileToastState,
  getMobileToastVariantPalette,
  mobileToastReducer,
  resolveMobileToastDuration,
  type MobileToastInput,
} from "../src/app/components/kit/toast-model";

const noop = () => undefined;

function show(id: string, input: MobileToastInput) {
  return { id, input, type: "show" } as const;
}

test("a toast defaults to three seconds and stretches to six when it carries an action", () => {
  assert.equal(
    resolveMobileToastDuration({ title: "Kaydedildi" }),
    MOBILE_TOAST_DEFAULT_DURATION_MS,
  );
  assert.equal(
    resolveMobileToastDuration({
      action: { label: "Geri al", onPress: noop },
      title: "Not silindi",
    }),
    MOBILE_TOAST_ACTION_DURATION_MS,
  );
});

test("a loading toast has no duration, so nothing can retire it but its own resolution", () => {
  assert.equal(resolveMobileToastDuration({ title: "Yükleniyor…", variant: "loading" }), null);
  // Even an explicit duration cannot arm a loading card: the upload decides.
  assert.equal(
    resolveMobileToastDuration({ duration: 2_000, title: "Yükleniyor…", variant: "loading" }),
    null,
  );
});

test("an explicit duration is clamped instead of trusted", () => {
  assert.equal(
    resolveMobileToastDuration({ duration: 250, title: "a" }),
    MOBILE_TOAST_MIN_DURATION_MS,
  );
  assert.equal(
    resolveMobileToastDuration({ duration: 900_000, title: "a" }),
    MOBILE_TOAST_MAX_DURATION_MS,
  );
  assert.equal(resolveMobileToastDuration({ duration: 4_200, title: "a" }), 4_200);
  assert.equal(
    resolveMobileToastDuration({ duration: Number.NaN, title: "a" }),
    MOBILE_TOAST_DEFAULT_DURATION_MS,
  );
});

test("only one toast exists at a time — a new one replaces the old with no queue", () => {
  const first = mobileToastReducer(
    createMobileToastState(),
    show("toast-1", { title: "Bağlantı kopyalandı", variant: "success" }),
  );
  const second = mobileToastReducer(
    first,
    show("toast-2", { title: "Davet gönderildi", variant: "success" }),
  );

  assert.equal(first.entry?.title, "Bağlantı kopyalandı");
  assert.equal(second.entry?.id, "toast-2");
  assert.equal(second.entry?.title, "Davet gönderildi");
});

test("a shown toast normalizes its optional parts", () => {
  const state = mobileToastReducer(
    createMobileToastState(),
    show("toast-1", { subtitle: "   ", title: "Profil bilgileri güncellendi" }),
  );

  assert.deepEqual(
    { ...state.entry, action: state.entry?.action ?? null },
    {
      action: null,
      duration: MOBILE_TOAST_DEFAULT_DURATION_MS,
      id: "toast-1",
      revision: 0,
      subtitle: null,
      title: "Profil bilgileri güncellendi",
      variant: "info",
    },
  );
});

test("a loading toast morphs in place: same card id, bumped revision, real duration", () => {
  const loading = mobileToastReducer(
    createMobileToastState(),
    show("toast-1", { subtitle: "%64", title: "Profil fotoğrafı yükleniyor…", variant: "loading" }),
  );
  const resolved = mobileToastReducer(loading, {
    id: "toast-1",
    input: {
      subtitle: "Değişiklikler herkese görünür",
      title: "Profil fotoğrafı güncellendi",
      variant: "success",
    },
    type: "resolve",
  });

  assert.equal(loading.entry?.duration, null);
  // Same id: the card does not remount, so it never replays the entry slide.
  assert.equal(resolved.entry?.id, "toast-1");
  assert.equal(resolved.entry?.revision, 1);
  assert.equal(resolved.entry?.variant, "success");
  assert.equal(resolved.entry?.duration, MOBILE_TOAST_DEFAULT_DURATION_MS);
});

test("a resolution that arrives after its card was replaced is dropped", () => {
  const loading = mobileToastReducer(
    createMobileToastState(),
    show("toast-1", { title: "Yükleniyor…", variant: "loading" }),
  );
  const replaced = mobileToastReducer(loading, show("toast-2", { title: "Kanal oluşturuldu" }));
  const late = mobileToastReducer(replaced, {
    id: "toast-1",
    input: { title: "Yüklendi", variant: "success" },
    type: "resolve",
  });

  // A finished upload must not reopen a toast the screen has already moved past.
  assert.equal(late, replaced);
  assert.equal(late.entry?.id, "toast-2");
});

test("dismiss only retires the card it names", () => {
  const state = mobileToastReducer(createMobileToastState(), show("toast-1", { title: "a" }));

  assert.equal(mobileToastReducer(state, { id: "toast-9", type: "dismiss" }), state);
  assert.equal(mobileToastReducer(state, { id: "toast-1", type: "dismiss" }).entry, null);
});

test("the legacy tone vocabulary maps onto variants in exactly one place", () => {
  assert.deepEqual(MOBILE_TOAST_TONE_VARIANTS, {
    danger: "error",
    info: "info",
    success: "success",
    warning: "warning",
  });
});

test("every variant names an icon from the shared line set", () => {
  assert.deepEqual(MOBILE_TOAST_VARIANT_ICONS, {
    action: "trash",
    error: "close",
    info: "info",
    loading: "loader-arc",
    success: "check",
    warning: "alert-triangle",
  });
});

test("variant colour comes from the theme, so the card itself never changes", () => {
  for (const theme of [lightTheme, darkTheme]) {
    const success = getMobileToastVariantPalette(theme, "success");
    const error = getMobileToastVariantPalette(theme, "error");
    const undo = getMobileToastVariantPalette(theme, "action");

    assert.notEqual(success.iconSurface, error.iconSurface);
    assert.equal(success.timer, success.iconColor);
    // Undo is the one filled action; every other button is the variant tint.
    assert.equal(undo.actionSurface, theme.toast.variants.action.actionSurface);
    assert.notEqual(undo.actionSurface, undo.iconSurface);
    assert.equal(undo.iconBorder, theme.toast.variants.action.iconBorder);
    assert.equal(error.iconBorder, null);
  }

  // The handoff pins the toast card in both themes; it is not the app card.
  assert.equal(lightTheme.toast.card, "#FFFFFF");
  assert.equal(darkTheme.toast.card, "#1E2235");
  assert.equal(darkTheme.toast.cardBorder, "#2E3452");
});
