import { MobileFontGate } from "../design/mobile-font-gate";
import { MobileSplashGate } from "./mobile-splash-gate";
import { MobileNavigator } from "../navigation/mobile-navigator";
import { MobileProductApp } from "./mobile-product-app";
import { MobileAppProviders } from "./providers/mobile-app-providers";

export function WhisprMobileRoot() {
  return (
    <MobileFontGate>
      <MobileAppProviders>
        <MobileSplashGate>
          <MobileProductApp Navigator={MobileNavigator} />
        </MobileSplashGate>
      </MobileAppProviders>
    </MobileFontGate>
  );
}
