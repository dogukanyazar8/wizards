"use client";

import { signOut } from "next-auth/react";
import { useCallback } from "react";

import { renderSettingsSection } from "@/components/settings/settings-sections";
import { SettingsWindow, type SettingsWindowProps } from "@/components/settings/settings-window";
import type { SettingsBootstrapPayload } from "@/lib/settings/bootstrap-types";

export type SettingsWindowRouteProps = Pick<SettingsWindowProps, "mode" | "route"> & {
  readonly bootstrap: SettingsBootstrapPayload;
};

/**
 * Rota sayfası ile pencerenin arasındaki ince istemci katmanı.
 *
 * İki işi var:
 *
 * 1. Çıkış düğmesini bağlamak — `signOut` bir istemci çağrısıdır ve iki rota dosyası da
 *    (tam ekran + intercepting modal) sunucu bileşenidir. Bunu iki yerde tekrarlamak, birinde
 *    `redirectTo`'yu unutmak demekti.
 * 2. **Bölüm kayıt defterini** yuvaya takmak (Ş13). Defter bir istemci modülü; sunucu
 *    bileşeninden geçirilemez, bu yüzden bağ burada kuruluyor.
 *
 * Bootstrap **bütün** olarak iniyor: `Masaüstü` ve `Hakkında` bölümleri `buildInfo` ve
 * `preferredReleaseChannel` alanlarını okuyor, `Hesabım` ise yalnız `initialAccount`. Yükün
 * tamamı seri hâle getirilebilir (`bootstrap-types.ts`), ikinci bir sunucu turu gerekmiyor.
 */
export function SettingsWindowRoute({ bootstrap, mode, route }: SettingsWindowRouteProps) {
  const handleSignOut = useCallback(() => {
    void signOut({ redirectTo: "/login" });
  }, []);

  const handleRenderSection = useCallback(
    (input: Parameters<NonNullable<SettingsWindowProps["renderSection"]>>[0]) =>
      renderSettingsSection(input, bootstrap),
    [bootstrap],
  );

  return (
    <SettingsWindow
      account={bootstrap.initialAccount}
      mode={mode}
      onSignOut={handleSignOut}
      renderSection={handleRenderSection}
      route={route}
    />
  );
}
