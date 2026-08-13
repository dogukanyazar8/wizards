import React from "react";
import { render } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

const mockCleanupPushRuntime = jest.fn();
let mockPushRuntimeOptions: {
  declineDMCall: (conversationId: string, fromUserId: string) => void;
} | null = null;
const mockStartMobilePushResponseRuntime = jest.fn((options: typeof mockPushRuntimeOptions) => {
  mockPushRuntimeOptions = options;
  return mockCleanupPushRuntime;
});
const mockDeclineCalls: number[] = [];
let mockDeclineIdentity = 0;

jest.mock("../src/notifications/mobile-push-response-runtime", () => ({
  startMobilePushResponseRuntime: (options: unknown) => mockStartMobilePushResponseRuntime(options),
}));

jest.mock("../src/app/providers/mobile-realtime-provider", () => ({
  useMobileRealtimeRuntime: () => {
    const identity = mockDeclineIdentity;
    return {
      emitDMCallDecline: (..._args: unknown[]) => mockDeclineCalls.push(identity),
    };
  },
}));

import { MobilePushResponseBridge } from "../src/app/providers/mobile-push-response-bridge";

describe("mobile push response bridge", () => {
  afterEach(() => {
    mockCleanupPushRuntime.mockClear();
    mockStartMobilePushResponseRuntime.mockClear();
    mockPushRuntimeOptions = null;
    mockDeclineCalls.length = 0;
    mockDeclineIdentity = 0;
  });

  it("mounts native notification response hooks once across realtime rerenders", async () => {
    const view = await render(<MobilePushResponseBridge />);
    expect(mockStartMobilePushResponseRuntime).toHaveBeenCalledTimes(1);

    mockDeclineIdentity += 1;
    await view.rerender(<MobilePushResponseBridge />);

    expect(mockStartMobilePushResponseRuntime).toHaveBeenCalledTimes(1);
    expect(mockCleanupPushRuntime).not.toHaveBeenCalled();
    mockPushRuntimeOptions?.declineDMCall("conversation-1", "caller-1");
    expect(mockDeclineCalls).toEqual([1]);
  });
});
