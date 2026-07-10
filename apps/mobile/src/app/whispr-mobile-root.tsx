import { MobileNavigator } from "../navigation/mobile-navigator";
import { MobileProductApp } from "./mobile-product-app";
import { MobileAppProviders } from "./providers/mobile-app-providers";

export function WhisprMobileRoot() {
  return (
    <MobileAppProviders>
      <MobileProductApp Navigator={MobileNavigator} />
    </MobileAppProviders>
  );
}
