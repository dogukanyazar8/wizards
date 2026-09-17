import { act, cleanup, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useMobileScreenShareConsent,
  MOBILE_SCREEN_SHARE_CONSENT_STORAGE_KEY,
} from "../src/voice/use-mobile-screen-share-consent";

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
});
afterEach(() => cleanup());

it("requires confirmation and persists remember only after confirmation", async () => {
  const start = jest.fn(async () => undefined);
  const view = await renderHook(() => useMobileScreenShareConsent(false, start));
  await act(() => view.result.current.request());
  expect(view.result.current.visible).toBe(true);
  expect(start).not.toHaveBeenCalled();
  await act(() => view.result.current.setRemember(true));
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  await act(() => view.result.current.confirm());
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    MOBILE_SCREEN_SHARE_CONSENT_STORAGE_KEY,
    "true",
  );
  expect(start).toHaveBeenCalledTimes(1);
  expect(view.result.current.visible).toBe(false);
});

it("remembered consent skips only the informational sheet; stopping always bypasses it", async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValue("true");
  const toggle = jest.fn(async () => undefined);
  const view = await renderHook(({ sharing }) => useMobileScreenShareConsent(sharing, toggle), {
    initialProps: { sharing: false },
  });
  await act(() => view.result.current.request());
  expect(toggle).toHaveBeenCalledTimes(1);
  expect(view.result.current.visible).toBe(false);
  await view.rerender({ sharing: true });
  await act(() => view.result.current.request());
  expect(toggle).toHaveBeenCalledTimes(2);
  expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
});

it("storage failure shows consent and cancellation never starts capture", async () => {
  jest.mocked(AsyncStorage.getItem).mockRejectedValue(new Error("unavailable"));
  const start = jest.fn(async () => undefined);
  const view = await renderHook(() => useMobileScreenShareConsent(false, start));
  await act(() => view.result.current.request());
  expect(view.result.current.visible).toBe(true);
  await act(() => view.result.current.cancel());
  expect(start).not.toHaveBeenCalled();
});
