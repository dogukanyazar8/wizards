import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const mockSaveNote = jest.fn<(...args: unknown[]) => Promise<string | null>>();
const mockUpdatePresence = jest.fn();
const mockUpdateProfile = jest.fn();
const mockSelectionHaptic = jest.fn();
let mockPresencePending = false;

jest.mock("../src/social/mobile-user-note-client", () => {
  const actual = jest.requireActual<Record<string, unknown>>(
    "../src/social/mobile-user-note-client",
  );
  return { ...actual, saveMobileUserNote: (...args: unknown[]) => mockSaveNote(...args) };
});

jest.mock("../src/social/mobile-social-query", () => ({
  useMobileSocialMutations: () => ({
    updatePresence: { isPending: mockPresencePending, mutate: mockUpdatePresence },
    updateProfile: { isPending: false, mutate: mockUpdateProfile },
  }),
}));

jest.mock("../src/app/providers/mobile-haptics-provider", () => ({
  useMobileHaptics: () => ({
    enabled: true,
    impact: jest.fn(),
    notification: jest.fn(),
    selection: mockSelectionHaptic,
    setEnabled: jest.fn(),
  }),
}));

import { lightTheme, darkTheme } from "../src/design/themes";
import { createMobileProfileSheetStyles } from "../src/social/mobile-profile-sheets.styles";
import { MobileStatusPickerSheet } from "../src/social/mobile-status-picker-sheet";
import { MobileUserNoteSheet } from "../src/social/mobile-user-note-sheet";
import { MOBILE_USER_NOTE_MAX_LENGTH } from "../src/social/mobile-user-note-client";

const client = {} as never;
const NOTE = "mobile-profile-note-sheet";
const STATUS = "mobile-profile-status-sheet";

const onClose = jest.fn();
const onOpenCustomStatus = jest.fn();

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

async function renderNoteSheet(
  overrides: Partial<React.ComponentProps<typeof MobileUserNoteSheet>> = {},
) {
  return await renderWithQuery(
    <MobileUserNoteSheet
      client={client}
      note={null}
      onClose={onClose}
      open
      userId="user-2"
      username="aysegul_dev"
      {...overrides}
    />,
  );
}

async function renderPicker(
  overrides: Partial<React.ComponentProps<typeof MobileStatusPickerSheet>> = {},
) {
  return await renderWithQuery(
    <MobileStatusPickerSheet
      client={client}
      customStatus={null}
      customStatusEmoji={null}
      onClose={onClose}
      onOpenCustomStatus={onOpenCustomStatus}
      open
      presence="ONLINE"
      {...overrides}
    />,
  );
}

beforeEach(() => {
  mockSaveNote.mockReset();
  mockSaveNote.mockResolvedValue(null);
  mockUpdatePresence.mockReset();
  mockUpdateProfile.mockReset();
  mockSelectionHaptic.mockReset();
  onClose.mockReset();
  onOpenCustomStatus.mockReset();
  mockPresencePending = false;
});

describe("2b note sheet", () => {
  it("names the subject in the title and in the privacy line", async () => {
    const view = await renderNoteSheet();

    expect(view.getByTestId(`${NOTE}-title`).props.children).toBe("Not — aysegul_dev");
    expect(view.getByTestId(`${NOTE}-privacy`).props.children).toContain("aysegul_dev");
  });

  it("counts against the stored limit", async () => {
    const view = await renderNoteSheet();

    expect(view.getByTestId(`${NOTE}-counter`).props.children).toBe(
      `0/${MOBILE_USER_NOTE_MAX_LENGTH}`,
    );

    await fireEvent.changeText(view.getByTestId(`${NOTE}-input`), "Staging erişimi var");

    expect(view.getByTestId(`${NOTE}-counter`).props.children).toBe(
      `19/${MOBILE_USER_NOTE_MAX_LENGTH}`,
    );
  });

  it("keeps Save inert until the note actually changed", async () => {
    const view = await renderNoteSheet({ note: "Staging erişimi var" });

    expect(view.getByTestId(`${NOTE}-save`).props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(view.getByTestId(`${NOTE}-save`));
    expect(mockSaveNote).not.toHaveBeenCalled();

    await fireEvent.changeText(view.getByTestId(`${NOTE}-input`), "Yeni not");
    expect(view.getByTestId(`${NOTE}-save`).props.accessibilityState.disabled).toBe(false);
  });

  it("opens pre-filled with the stored note", async () => {
    const view = await renderNoteSheet({ note: "Staging erişimi var" });

    expect(view.getByTestId(`${NOTE}-input`).props.value).toBe("Staging erişimi var");
  });

  it("saves the draft and closes", async () => {
    mockSaveNote.mockResolvedValue("Staging erişimi var");
    const view = await renderNoteSheet();

    await fireEvent.changeText(view.getByTestId(`${NOTE}-input`), "Staging erişimi var");
    await fireEvent.press(view.getByTestId(`${NOTE}-save`));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockSaveNote).toHaveBeenCalledWith(client, "user-2", "Staging erişimi var");
  });

  it("treats clearing the field as a delete", async () => {
    const view = await renderNoteSheet({ note: "Staging erişimi var" });

    await fireEvent.changeText(view.getByTestId(`${NOTE}-input`), "");
    expect(view.getByTestId(`${NOTE}-save`).props.accessibilityState.disabled).toBe(false);

    await fireEvent.press(view.getByTestId(`${NOTE}-save`));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockSaveNote).toHaveBeenCalledWith(client, "user-2", "");
  });

  it("keeps the sheet open and reports a failed save", async () => {
    mockSaveNote.mockRejectedValue(new Error("offline"));
    const view = await renderNoteSheet();

    await fireEvent.changeText(view.getByTestId(`${NOTE}-input`), "Not");
    await fireEvent.press(view.getByTestId(`${NOTE}-save`));

    await waitFor(() => expect(view.queryByTestId(`${NOTE}-error`)).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("2c status picker", () => {
  it("renders the four handoff rows with their sub-copy", async () => {
    const view = await renderPicker();

    expect(view.getByTestId(`${STATUS}-online`)).toBeTruthy();
    expect(view.getByTestId(`${STATUS}-idle`)).toBeTruthy();
    expect(view.getByTestId(`${STATUS}-dnd`)).toBeTruthy();
    expect(view.getByTestId(`${STATUS}-invisible`)).toBeTruthy();
    expect(view.getByText("Tüm bildirimler susturulur")).toBeTruthy();
    expect(view.getByText("Çevrimdışı görünürsün, her şeyi kullanabilirsin")).toBeTruthy();
  });

  it("checks the row matching the live presence", async () => {
    const view = await renderPicker({ presence: "DND" });

    expect(view.getByTestId(`${STATUS}-dnd`).props.accessibilityState.checked).toBe(true);
    expect(view.getByTestId(`${STATUS}-online`).props.accessibilityState.checked).toBe(false);
  });

  it("shows an OFFLINE account as Invisible rather than unselected", async () => {
    const view = await renderPicker({ presence: "OFFLINE" });

    expect(view.getByTestId(`${STATUS}-invisible`).props.accessibilityState.checked).toBe(true);
  });

  it("writes Invisible as OFFLINE, taps a haptic and closes", async () => {
    const view = await renderPicker();

    await fireEvent.press(view.getByTestId(`${STATUS}-invisible`));

    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
    expect(mockUpdatePresence).toHaveBeenCalledTimes(1);
    expect(mockUpdatePresence.mock.calls[0]?.[0]).toBe("OFFLINE");

    const options = mockUpdatePresence.mock.calls[0]?.[1] as { onSuccess: () => void };
    await act(async () => {
      options.onSuccess();
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("ignores taps while a presence write is in flight", async () => {
    mockPresencePending = true;
    const view = await renderPicker();

    await fireEvent.press(view.getByTestId(`${STATUS}-idle`));

    expect(mockUpdatePresence).not.toHaveBeenCalled();
  });

  it("previews the current status message and opens the editor", async () => {
    const view = await renderPicker({
      customStatus: "Release notları hazırlanıyor",
      customStatusEmoji: "🎧",
    });

    const row = view.getByTestId(`${STATUS}-custom-status`);
    expect(row.props.accessibilityLabel).toContain("🎧 Release notları hazırlanıyor");

    await fireEvent.press(row);
    expect(onClose).toHaveBeenCalled();
    expect(onOpenCustomStatus).toHaveBeenCalled();
  });
});

describe("11e theme contract", () => {
  it("reads the selected row and note field from tokens in both themes", () => {
    const light = createMobileProfileSheetStyles(lightTheme);
    const dark = createMobileProfileSheetStyles(darkTheme);

    expect(light.statusRowSelected.backgroundColor).toBe(lightTheme.profileSheet.selectedSurface);
    expect(light.statusRowSelected.borderColor).toBe(lightTheme.profileSheet.selectedBorder);
    expect(dark.statusRowSelected.backgroundColor).toBe(darkTheme.profileSheet.selectedSurface);
    expect(dark.statusRowSelected.borderColor).toBe(darkTheme.profileSheet.selectedBorder);

    expect(light.noteField.backgroundColor).toBe(lightTheme.profileSheet.noteFieldSurface);
    expect(light.noteFieldFocused.borderColor).toBe(lightTheme.profileSheet.noteFieldFocusBorder);
    expect(light.noteFieldRingFocused.backgroundColor).toBe(
      lightTheme.profileSheet.noteFieldFocusRing,
    );
    expect(dark.noteField.backgroundColor).toBe(darkTheme.profileSheet.noteFieldSurface);
    expect(dark.noteFieldRingFocused.backgroundColor).toBe(
      darkTheme.profileSheet.noteFieldFocusRing,
    );
  });

  it("keeps the handoff sheet geometry: r28 top corners and a 44x5 handle", () => {
    const styles = createMobileProfileSheetStyles(lightTheme);

    expect(styles.panel.borderTopLeftRadius).toBe(28);
    expect(styles.panel.borderTopRightRadius).toBe(28);
    expect(styles.handle.width).toBe(44);
    expect(styles.handle.height).toBe(5);
    expect(styles.statusTile.width).toBe(36);
    expect(styles.statusTile.borderRadius).toBe(13);
  });

  it("keeps every row above the minimum touch target", () => {
    const styles = createMobileProfileSheetStyles(lightTheme);

    expect(styles.statusRow.minHeight).toBe(lightTheme.sizing.minTouchTarget);
    expect(styles.noteSaveAction.minHeight).toBe(lightTheme.sizing.minTouchTarget);
  });
});
