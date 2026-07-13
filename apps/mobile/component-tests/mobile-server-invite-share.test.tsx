import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { Button } from "../src/app/components/kit";
import { shareMobileInviteUrl } from "../src/invite/mobile-invite-share";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

describe("mobile server invite share", () => {
  it("shares only the server-provided canonical URL", async () => {
    const share = jest.fn().mockResolvedValue({ action: "sharedAction" });
    const shareUrl = "https://whispr.team/invite/Join_Me-42";
    const view = await render(
      <Button
        label="Share"
        onPress={() => {
          void shareMobileInviteUrl(shareUrl, { share });
        }}
        testID="mobile-server-invite-share-server-1"
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-server-invite-share-server-1"));
    expect(share).toHaveBeenCalledWith({ message: shareUrl });
  });
});
