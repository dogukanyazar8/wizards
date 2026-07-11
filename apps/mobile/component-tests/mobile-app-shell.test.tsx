import { describe, expect, it } from "@jest/globals";
import { createMobileAppShellStyles } from "../src/app/mobile-app-shell";
import { lightTheme } from "../src/design/themes";

describe("MobileAppShell", () => {
  it("does not reserve a fixed bottom gap for signed-in navigation", () => {
    const styles = createMobileAppShellStyles(lightTheme);

    expect(styles.contentSignedIn).toMatchObject(styles.contentOwnScroll);
    expect(styles.contentSignedIn).not.toHaveProperty("paddingBottom");
    expect(styles.contentSignedIn).not.toHaveProperty("paddingTop");
  });
});
