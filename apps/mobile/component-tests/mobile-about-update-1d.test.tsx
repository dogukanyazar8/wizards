import React, { useState } from "react";
import type { MobileAppUpdateLatest, MobileReleaseDetail } from "@wizards/types";
import { fireEvent, render, within } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useReducedMotion, withRepeat } from "react-native-reanimated";

import type {
  MobileUpdateController,
  MobileUpdateSnapshot,
} from "../src/about/mobile-update-controller";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { AboutUpdateBanner } from "../src/app/screens/about/about-update-banner";
import { AboutUpdateSheet } from "../src/app/screens/about/about-update-sheet";
import { lightTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({
    children,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly testID?: string;
  }) => {
    const ReactRuntime = require("react");
    const { View: MockView } = require("react-native");
    return ReactRuntime.createElement(MockView, props, children);
  },
}));

const copy = mobileCopy.tr;
const latest: MobileAppUpdateLatest = {
  codename: "Halo",
  mandatory: false,
  releasedAt: "2026-07-28T00:00:00.000Z",
  sizeBytes: 50_541_363,
  version: "0.9.0",
};
const release: MobileReleaseDetail = {
  changeCount: 3,
  changes: [
    { title: "Görüntülü aramada arka plan bulanıklığı", type: "new" },
    { title: "Sohbet klasörleri ve akıllı sıralama", type: "new" },
    { title: "Daha hızlı açılış", type: "improved" },
  ],
  codename: "Halo",
  releasedAt: latest.releasedAt,
  sizeBytes: latest.sizeBytes,
  version: latest.version,
};

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (merged, entry) => ({ ...merged, ...flattenStyle(entry) }),
      {},
    );
  }
  return style && typeof style === "object" ? (style as Record<string, unknown>) : {};
}

function renderAbout(ui: React.ReactElement, bottomInset = 34) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets: { bottom: bottomInset, left: 0, right: 0, top: 47 },
      }}
    >
      <MobileThemeProvider>
        <MobileLocaleProvider>{ui}</MobileLocaleProvider>
      </MobileThemeProvider>
    </SafeAreaProvider>,
  );
}

function createController({
  canPause = false,
  reportsPercent = false,
  snapshot,
}: {
  readonly canPause?: boolean;
  readonly reportsPercent?: boolean;
  readonly snapshot: MobileUpdateSnapshot;
}) {
  const pause = jest.fn(async () => undefined);
  const resume = jest.fn(async () => undefined);
  const download = jest.fn(async () => undefined);
  const install = jest.fn(async () => undefined);
  const controller: MobileUpdateController = {
    capabilities: { canPause, isEnabled: true, reportsPercent },
    cancelCheck: jest.fn(),
    check: jest.fn(async () => snapshot.state),
    download,
    getSnapshot: () => snapshot,
    install,
    pause,
    resume,
    subscribe: () => () => undefined,
  };
  return { controller, download, install, pause, resume };
}

function renderSheet(
  controller: MobileUpdateController,
  overrides: Partial<React.ComponentProps<typeof AboutUpdateSheet>> = {},
) {
  return renderAbout(
    <AboutUpdateSheet
      controller={controller}
      copy={copy}
      formatEta={(seconds) => `${seconds} sn`}
      formatPercent={(percent) => `%${Math.round(percent)}`}
      formatSize={() => "48,2 MB"}
      latest={latest}
      onClose={jest.fn()}
      onReadyInBackground={jest.fn()}
      open
      {...overrides}
    />,
  );
}

describe("1d About update flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  it("renders the available banner above its release changes and omits it for current state", async () => {
    const available = await renderAbout(
      <AboutUpdateBanner
        copy={copy}
        dateLabel="28 Tem 2026"
        formatSize={() => "48,2 MB"}
        latest={latest}
        onOpenReleaseNote={jest.fn()}
        onRequestUpdate={jest.fn()}
        onSkipVersion={jest.fn(async () => true)}
        release={release}
        skippedVersion={null}
        state="available"
      />,
    );

    expect(available.getByTestId("mobile-about-update-banner")).toBeTruthy();
    expect(available.getAllByTestId(/^mobile-about-update-change-/)).toHaveLength(2);
    expect(available.getByText(release.changes[0]!.title)).toBeTruthy();
    expect(available.getByText(release.changes[1]!.title)).toBeTruthy();
    expect(available.queryByText(release.changes[2]!.title)).toBeNull();

    await available.rerender(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 844, width: 390, x: 0, y: 0 },
          insets: { bottom: 34, left: 0, right: 0, top: 47 },
        }}
      >
        <MobileThemeProvider>
          <MobileLocaleProvider>
            <AboutUpdateBanner
              copy={copy}
              dateLabel="28 Tem 2026"
              formatSize={() => "48,2 MB"}
              latest={latest}
              onOpenReleaseNote={jest.fn()}
              onRequestUpdate={jest.fn()}
              onSkipVersion={jest.fn(async () => true)}
              release={release}
              skippedVersion={null}
              state="current"
            />
          </MobileLocaleProvider>
        </MobileThemeProvider>
      </SafeAreaProvider>,
    );
    expect(available.queryByTestId("mobile-about-update-banner")).toBeNull();
  });

  it("uses the 160-degree gradient approximation and exact update-card shadow", async () => {
    const view = await renderAbout(
      <AboutUpdateBanner
        copy={copy}
        dateLabel="28 Tem 2026"
        formatSize={() => "48,2 MB"}
        latest={latest}
        onOpenReleaseNote={jest.fn()}
        onRequestUpdate={jest.fn()}
        onSkipVersion={jest.fn(async () => true)}
        release={release}
        skippedVersion={null}
        state="available"
      />,
    );

    expect(view.getByTestId("mobile-about-update-gradient").props).toMatchObject({
      colors: [lightTheme.about.updateGradientFrom, lightTheme.about.updateGradientTo],
      end: { x: 0.88, y: 1 },
      start: { x: 0.12, y: 0 },
    });
    expect(flattenStyle(view.getByTestId("mobile-about-update-banner").props.style)).toMatchObject({
      borderRadius: 24,
      elevation: 12,
      shadowColor: lightTheme.about.updateGradientTo,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: 0.28,
      shadowRadius: 30,
    });
  });

  it("hides skip for mandatory releases and removes a skipped optional release", async () => {
    const onSkipVersion = jest.fn(async () => true);

    function OptionalHarness() {
      const [skippedVersion, setSkippedVersion] = useState<string | null>(null);
      return (
        <AboutUpdateBanner
          copy={copy}
          dateLabel="28 Tem 2026"
          formatSize={() => "48,2 MB"}
          latest={latest}
          onOpenReleaseNote={jest.fn()}
          onRequestUpdate={jest.fn()}
          onSkipVersion={async (version) => {
            const saved = await onSkipVersion(version);
            if (saved) setSkippedVersion(version);
            return saved;
          }}
          release={release}
          skippedVersion={skippedVersion}
          state="available"
        />
      );
    }

    const optional = await renderAbout(<OptionalHarness />);
    await fireEvent(optional.getByTestId("mobile-about-update-whats-new"), "longPress");
    await fireEvent.press(optional.getByTestId("mobile-about-update-skip"));
    expect(onSkipVersion).toHaveBeenCalledWith(latest.version);
    expect(optional.queryByTestId("mobile-about-update-banner")).toBeNull();

    const mandatory = await renderAbout(
      <AboutUpdateBanner
        copy={copy}
        dateLabel="28 Tem 2026"
        formatSize={() => "48,2 MB"}
        latest={{ ...latest, mandatory: true }}
        onOpenReleaseNote={jest.fn()}
        onRequestUpdate={jest.fn()}
        onSkipVersion={jest.fn(async () => true)}
        release={release}
        skippedVersion={null}
        state="available"
      />,
    );
    await fireEvent(mandatory.getByTestId("mobile-about-update-whats-new"), "longPress");
    expect(mandatory.queryByText(copy.updateActionSkip)).toBeNull();
  });

  it("hides invented progress and pause when the adapter cannot report them", async () => {
    const { controller } = createController({
      snapshot: {
        checkedAt: null,
        error: null,
        latestVersion: latest.version,
        progress: {
          downloadedBytes: null,
          etaSeconds: null,
          network: "wifi",
          percent: null,
          step: "download",
          totalBytes: null,
        },
        state: "downloading",
      },
    });
    const view = await renderSheet(controller);

    expect(view.queryByTestId("mobile-about-update-percent")).toBeNull();
    expect(view.queryByText(copy.updatePause)).toBeNull();
    expect(view.queryByText(/yaklaşık/i)).toBeNull();
    expect(view.getByText("48,2 MB indiriliyor")).toBeTruthy();
    expect(
      flattenStyle(view.getByTestId("mobile-about-update-indeterminate").props.style),
    ).toMatchObject({ width: "35%" });
    expect(
      flattenStyle(view.getByTestId("mobile-about-update-background").props.style),
    ).toMatchObject({ flex: 1 });
  });

  it("shows real percent and keeps pause/resume as one button when the adapter supports them", async () => {
    const { controller, pause, resume } = createController({
      canPause: true,
      reportsPercent: true,
      snapshot: {
        checkedAt: null,
        error: null,
        latestVersion: latest.version,
        progress: {
          downloadedBytes: 19_293_798,
          etaSeconds: 12,
          network: "wifi",
          percent: 38,
          step: "download",
          totalBytes: 50_541_363,
        },
        state: "downloading",
      },
    });
    const view = await renderSheet(controller);

    expect(view.getByText("%38")).toBeTruthy();
    expect(
      flattenStyle(view.getByTestId("mobile-about-update-progress-fill").props.style),
    ).toMatchObject({ width: "38%" });
    expect(view.getAllByTestId("mobile-about-update-pause-resume")).toHaveLength(1);
    await fireEvent.press(view.getByTestId("mobile-about-update-pause-resume"));
    expect(pause).toHaveBeenCalledTimes(1);
    expect(view.getByText(copy.updateResume)).toBeTruthy();
    expect(view.getAllByTestId("mobile-about-update-pause-resume")).toHaveLength(1);
    await fireEvent.press(view.getByTestId("mobile-about-update-pause-resume"));
    expect(resume).toHaveBeenCalledTimes(1);
    expect(view.getByText(copy.updatePause)).toBeTruthy();
  });

  it("renders exactly three stages with one active spinner", async () => {
    const { controller } = createController({
      snapshot: {
        checkedAt: null,
        error: null,
        latestVersion: latest.version,
        progress: {
          downloadedBytes: null,
          etaSeconds: null,
          network: "cellular",
          percent: null,
          step: "download",
          totalBytes: null,
        },
        state: "downloading",
      },
    });
    const view = await renderSheet(controller);

    expect(view.getAllByTestId(/^mobile-about-update-step-row-/)).toHaveLength(3);
    expect(view.getAllByTestId("mobile-about-update-step-active")).toHaveLength(1);
    expect(view.getByText(copy.updateStepVerify).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: lightTheme.about.textMuted })]),
    );
    expect(view.getByText(copy.updateStepInstall).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: lightTheme.about.textMuted })]),
    );
  });

  it("shows verification danger and retries through the same controller", async () => {
    const { controller, download } = createController({
      snapshot: {
        checkedAt: null,
        error: "verify-failed",
        latestVersion: latest.version,
        progress: null,
        state: "failed",
      },
    });
    const view = await renderSheet(controller);

    expect(view.getByText(copy.updateVerifyFailed)).toBeTruthy();
    expect(view.getByText(copy.updateVerifyFailedNote)).toBeTruthy();
    expect(
      flattenStyle(view.getByTestId("mobile-about-update-verify-danger").props.style),
    ).toMatchObject({ borderColor: lightTheme.about.danger });
    await fireEvent.press(view.getByTestId("mobile-about-update-retry"));
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("offers the real install action after verification is ready", async () => {
    const { controller, install } = createController({
      snapshot: {
        checkedAt: "2026-07-30T10:00:00.000Z",
        error: null,
        latestVersion: latest.version,
        progress: null,
        state: "ready",
      },
    });
    const view = await renderSheet(controller);

    await fireEvent.press(view.getByTestId("mobile-about-update-install"));
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("shows a verified APK as ready to install instead of still downloading", async () => {
    const { controller } = createController({
      snapshot: {
        checkedAt: "2026-07-31T07:39:00.000Z",
        completedSteps: ["download", "verify"],
        error: null,
        latestVersion: latest.version,
        progress: null,
        state: "ready",
      },
    });
    const view = await renderSheet(controller);

    expect(view.getByText("0.9.0 kuruluma hazır")).toBeTruthy();
    expect(view.getByText("İndirme ve dosya doğrulaması tamamlandı")).toBeTruthy();
    expect(view.getAllByTestId("mobile-about-update-step-complete")).toHaveLength(2);
    expect(view.getAllByTestId("mobile-about-update-step-pending")).toHaveLength(1);
    expect(view.queryByTestId("mobile-about-update-step-active")).toBeNull();
    expect(
      flattenStyle(view.getByTestId("mobile-about-update-progress-fill").props.style),
    ).toMatchObject({ width: "100%" });
  });

  it("marks the download complete while the downloaded file is being verified", async () => {
    const { controller } = createController({
      reportsPercent: true,
      snapshot: {
        checkedAt: "2026-07-31T07:39:00.000Z",
        completedSteps: ["download"],
        error: null,
        latestVersion: latest.version,
        progress: {
          downloadedBytes: 25_270_681,
          etaSeconds: null,
          network: "wifi",
          percent: 50,
          step: "verify",
          totalBytes: latest.sizeBytes,
        },
        state: "downloading",
      },
    });
    const view = await renderSheet(controller);

    expect(view.getByText("0.9.0 doğrulanıyor")).toBeTruthy();
    expect(view.getAllByText("Dosya doğrulanıyor")).toHaveLength(2);
    expect(view.getAllByTestId("mobile-about-update-step-complete")).toHaveLength(1);
    expect(view.getAllByTestId("mobile-about-update-step-active")).toHaveLength(1);
    expect(view.getAllByTestId("mobile-about-update-step-pending")).toHaveLength(1);
  });

  it("keeps 44px device corners separate from 30px plus safe-area content padding", async () => {
    const { controller } = createController({
      snapshot: {
        checkedAt: null,
        error: null,
        latestVersion: latest.version,
        progress: {
          downloadedBytes: null,
          etaSeconds: null,
          network: "unknown",
          percent: null,
          step: "download",
          totalBytes: null,
        },
        state: "downloading",
      },
    });
    const view = await renderSheet(controller);
    const panelStyle = flattenStyle(
      view.getByTestId("mobile-about-update-sheet-panel").props.style,
    );

    expect(panelStyle).toMatchObject({
      borderBottomLeftRadius: 44,
      borderBottomRightRadius: 44,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      paddingBottom: 64,
    });
    expect(
      flattenStyle(view.getByTestId("mobile-about-update-sheet-backdrop").props.style),
    ).toMatchObject({ backgroundColor: lightTheme.about.scrim });
  });

  it("does not start spinner or indeterminate animations with reduced motion", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const { controller } = createController({
      snapshot: {
        checkedAt: null,
        error: null,
        latestVersion: latest.version,
        progress: {
          downloadedBytes: null,
          etaSeconds: null,
          network: "wifi",
          percent: null,
          step: "download",
          totalBytes: null,
        },
        state: "downloading",
      },
    });
    const view = await renderSheet(controller);

    expect(view.getByTestId("mobile-about-update-step-active")).toBeTruthy();
    expect(withRepeat).not.toHaveBeenCalled();
  });
});
