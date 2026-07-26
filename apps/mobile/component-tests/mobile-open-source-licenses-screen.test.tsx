import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { Linking } from "react-native";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { MOBILE_OPEN_SOURCE_LICENSE_GROUPS } from "../src/legal/mobile-open-source-license-manifest";
import { MobileOpenSourceLicensesScreen } from "../src/legal/mobile-open-source-licenses-screen";

const biggestLicense = MOBILE_OPEN_SOURCE_LICENSE_GROUPS[0]!;

function createProps(
  overrides: Partial<React.ComponentProps<typeof MobileOpenSourceLicensesScreen>> = {},
) {
  return {
    appVersion: "0.8.15",
    onBack: () => undefined,
    ...overrides,
  } satisfies React.ComponentProps<typeof MobileOpenSourceLicensesScreen>;
}

describe("open source licenses screen", () => {
  it("leads with the generated totals and the build it describes", async () => {
    const view = await render(<MobileOpenSourceLicensesScreen {...createProps()} />);

    expect(view.getByTestId("mobile-open-source-licenses-screen")).toBeTruthy();
    expect(view.getByText(copy.openSourceLicensesDescription)).toBeTruthy();
    expect(view.getByText(copy.openSourceLicensesPackagesLabel)).toBeTruthy();
    expect(view.getByText(copy.openSourceLicensesLicensesLabel)).toBeTruthy();
    expect(
      view.getByText(copy.openSourceLicensesVersionLabel.replace("{version}", "0.8.15")),
    ).toBeTruthy();
  });

  it("keeps license sections collapsed until they are opened", async () => {
    const view = await render(<MobileOpenSourceLicensesScreen {...createProps()} />);

    const header = view.getByTestId(`mobile-open-source-license-group-${biggestLicense.license}`);
    expect(header.props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));
    expect(
      view.queryByTestId(`mobile-open-source-package-${biggestLicense.packages[0]!.name}`),
    ).toBeNull();

    await fireEvent.press(header);

    expect(
      view.getByTestId(`mobile-open-source-package-${biggestLicense.packages[0]!.name}`),
    ).toBeTruthy();
  });

  it("cuts straight to a package when the reader searches for it", async () => {
    const view = await render(<MobileOpenSourceLicensesScreen {...createProps()} />);

    await fireEvent.changeText(
      view.getByTestId("mobile-open-source-licenses-search"),
      "react-native-svg",
    );

    // The matching section opens itself: a hit still behind a tap is not a hit.
    expect(view.getByTestId("mobile-open-source-package-react-native-svg")).toBeTruthy();
    expect(view.queryByTestId("mobile-open-source-package-zustand")).toBeNull();
  });

  it("explains an empty result and clears the search", async () => {
    const view = await render(<MobileOpenSourceLicensesScreen {...createProps()} />);
    const search = view.getByTestId("mobile-open-source-licenses-search");

    await fireEvent.changeText(search, "no-such-package-anywhere");
    expect(view.getByText(copy.openSourceLicensesEmptyTitle)).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-open-source-licenses-search-clear"));
    expect(view.queryByText(copy.openSourceLicensesEmptyTitle)).toBeNull();
  });

  it("opens the project page of a package that publishes one", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const linked = biggestLicense.packages.find((entry) => entry.homepage !== null)!;
    const view = await render(<MobileOpenSourceLicensesScreen {...createProps()} />);

    await fireEvent.changeText(view.getByTestId("mobile-open-source-licenses-search"), linked.name);
    await fireEvent.press(view.getByTestId(`mobile-open-source-package-${linked.name}`));

    expect(openURL).toHaveBeenCalledWith(linked.homepage);
    openURL.mockRestore();
  });

  it("returns to the about screen", async () => {
    const onBack = jest.fn();
    const view = await render(<MobileOpenSourceLicensesScreen {...createProps({ onBack })} />);

    await fireEvent.press(view.getByTestId("mobile-open-source-licenses-back"));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
