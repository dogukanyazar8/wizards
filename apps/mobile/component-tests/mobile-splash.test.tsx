import { fireEvent, render } from "@testing-library/react-native";

import { lightTheme } from "../src/design/themes";
import { mobileCopy } from "../src/locale/mobile-copy";
import { MobileSplashScreen } from "../src/app/screens/splash/mobile-splash-screen";

/**
 * SPEC-SPLASH §6/§7 — mobil açılış ekranının çizim denetimi.
 *
 * RNTL 14 asenkron: `render` await edilir, aksi hâlde sonraki testler bozuk bir
 * ağaç üzerinde koşar.
 */

const copy = mobileCopy.tr;

function renderSplash(props: Partial<React.ComponentProps<typeof MobileSplashScreen>> = {}) {
  return render(
    <MobileSplashScreen
      environmentLabel="UAT"
      environmentTone="uat"
      step="connecting"
      theme={lightTheme}
      versionLine="Whispr 0.8.15 · Echo"
      {...props}
    />,
  );
}

describe("MobileSplashScreen", () => {
  it("adım satırını, ipucunu, rozeti ve sürümü çizer", async () => {
    const view = await renderSplash({ step: "session" });

    expect(view.getByTestId("mobile-splash-stepline")).toBeTruthy();
    expect(view.getByText(`${copy.splashStepSession}…`)).toBeTruthy();
    expect(view.getByText(copy.splashTagline)).toBeTruthy();
    expect(view.getByText("UAT")).toBeTruthy();
    expect(view.getByText("Whispr 0.8.15 · Echo")).toBeTruthy();
  });

  it("dört ipucundan birini gösterir", async () => {
    const view = await renderSplash();
    const tips = [
      copy.splashTipCommandPalette,
      copy.splashTipVoiceMute,
      copy.splashTipQuickReaction,
      copy.splashTipMentions,
    ];

    expect(tips.some((tip) => view.queryByText(tip) !== null)).toBe(true);
  });

  it("durum ekranında adım satırı yerine başlık ve eylem çizer", async () => {
    const view = await renderSplash({ state: "offline" });

    expect(view.queryByTestId("mobile-splash-stepline")).toBeNull();
    expect(view.getByText(copy.splashStateOfflineTitle)).toBeTruthy();
    expect(view.getByText(copy.splashStateOfflineDescription)).toBeTruthy();
    expect(view.getByTestId("mobile-splash-action")).toBeTruthy();
  });

  it("güncelleme durumunda düğme yerine ilerleme çubuğu çizer", async () => {
    const view = await renderSplash({
      state: "updating",
      update: { downloadedBytes: 11_800_000, totalBytes: 18_400_000, version: "2.5.0" },
    });

    expect(view.getByTestId("mobile-splash-progress")).toBeTruthy();
    expect(view.queryByTestId("mobile-splash-action")).toBeNull();
    expect(view.getByText("%64 · 11,8 / 18,4 MB")).toBeTruthy();
    expect(view.getByText(/Sürüm 2\.5\.0 · 18,4 MB\./)).toBeTruthy();
  });

  it("toplam boyut bilinmiyorsa sayı yazmaz", async () => {
    const view = await renderSplash({
      state: "updating",
      update: { downloadedBytes: 12, totalBytes: null, version: null },
    });

    expect(view.getByText(copy.splashStateUpdatingDescriptionUnknown)).toBeTruthy();
    expect(view.queryByText(/MB/)).toBeNull();
  });

  it("oturum sona erdi durumunda giriş düğmesini çizer", async () => {
    const view = await renderSplash({ state: "sessionExpired" });

    expect(view.getByText(copy.splashStateSessionExpiredTitle)).toBeTruthy();
    expect(view.getByText(copy.splashStateSessionExpiredAction)).toBeTruthy();
  });

  it("durum düğmesine basınca eylemi çalıştırır", async () => {
    // Kapı `onAction` geçmeyi unuttuğunda düğme yine çiziliyor ama hiçbir şey
    // yapmıyordu; basış yolunun kendisi bu yüzden test edilir.
    const onAction = jest.fn();
    const view = await renderSplash({ onAction, state: "slow" });

    await fireEvent.press(view.getByTestId("mobile-splash-action"));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("kökü canlı bölge olarak işaretler", async () => {
    const view = await renderSplash();
    const root = view.getByTestId("mobile-splash-screen");

    expect(root.props.accessibilityLiveRegion).toBe("polite");
    expect(root.props.accessibilityRole).toBe("progressbar");
  });
});
