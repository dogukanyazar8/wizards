import { renderHook } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

const mockDismissPinnedStrip = jest.fn();

jest.mock("../src/dm/mobile-group-client", () => ({
  useMobileGroupCallStateQuery: () => ({ data: undefined }),
  useMobileGroupDetailsQuery: () => ({ data: undefined }),
  useMobileGroupSettingsMutations: () => ({
    dismissPinnedStrip: { mutate: mockDismissPinnedStrip },
  }),
}));

import type { MobileApiClient } from "../src/api/mobile-api-client";
import { useMobileGroupChat } from "../src/app/features/use-mobile-group-chat";

describe("mobile provider identity", () => {
  it("keeps the group pin dismissal callback stable across mutation observer rerenders", async () => {
    const client = {} as MobileApiClient;
    const view = await renderHook(() =>
      useMobileGroupChat({
        client,
        conversationId: "conversation-1",
        isGroup: true,
        viewerId: "viewer-1",
      }),
    );
    const firstDismiss = view.result.current?.onDismissPin;

    await view.rerender();

    expect(view.result.current?.onDismissPin).toBe(firstDismiss);
  });
});
