import { describe, expect, it } from "@jest/globals";
import { createMobileAppShellStyles } from "../src/app/mobile-app-shell";
import { lightTheme } from "../src/design/themes";

describe("MobileAppShell", () => {
  it("does not reserve a fixed bottom gap for signed-in navigation", () => {
    const styles = createMobileAppShellStyles(lightTheme);

    expect(styles.contentSignedIn).toMatchObject(styles.contentUnauthenticated);
    expect(styles.contentSignedIn).not.toHaveProperty("paddingBottom");
    expect(styles.contentSignedIn).not.toHaveProperty("paddingTop");
  });

  it("leaves unauthenticated auth screens full-bleed so their canonical layout owns safe areas", () => {
    const styles = createMobileAppShellStyles(lightTheme);

    expect(styles.shellUnauthenticated).toMatchObject({
      paddingHorizontal: 0,
      paddingTop: 0,
    });
    expect(styles.contentUnauthenticated).not.toHaveProperty("paddingBottom");
    expect(styles.contentUnauthenticated).not.toHaveProperty("paddingTop");
  });
});
