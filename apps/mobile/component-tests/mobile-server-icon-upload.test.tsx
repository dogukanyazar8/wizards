import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../src/app/components/kit/bottom-sheet", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    BottomSheet: ({ children, open, testID }: { children: React.ReactNode; open: boolean; testID: string }) =>
      open ? <View testID={testID}>{children}</View> : null,
  };
});

import { MobileServerCreateJoinSheet } from "../src/workspace/mobile-server-create-join-sheet";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

describe("mobile server icon upload", () => {
  it("targets an existing server exactly and keeps the UI capability-gated", async () => {
    const onUploadServerIcon = jest.fn().mockResolvedValue({ status: "cancelled" as const });
    const view = await render(
      <MobileServerCreateJoinSheet
        busy={false}
        error={null}
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onJoin={jest.fn()}
        onServerReady={jest.fn()}
        onUploadServerIcon={onUploadServerIcon}
        open
        serverIconTargetId="server-existing"
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-server-create-icon"));
    await waitFor(() =>
      expect(onUploadServerIcon).toHaveBeenCalledWith("server-existing", expect.any(Function)),
    );

    const workspaceBrowser = readFileSync(
      join(process.cwd(), "src", "app", "screens", "workspace-browser.tsx"),
      "utf8",
    );
    expect(workspaceBrowser).toMatch(/capabilities\.canUploadServerIcon === true/);
    expect(workspaceBrowser).toMatch(/openServerIconUpload\(activeServerId\)/);
  });
});
