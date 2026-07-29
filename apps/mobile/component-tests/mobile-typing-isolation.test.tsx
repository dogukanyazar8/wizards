import React from "react";
import { Text, View } from "react-native";
import { act, render } from "@testing-library/react-native";
import { afterEach, describe, expect, it } from "@jest/globals";

import {
  useMobileChannelTypingLabels,
  useMobileDMTypingLabel,
} from "../src/app/features/use-mobile-typing-labels";
import { useMobileDMRowTyping } from "../src/app/features/use-mobile-dm-row-typing";
import { useMobileTypingStore } from "../src/state/mobile-typing-store";
import { replaceMobileChannelTypingUsers } from "../src/realtime/mobile-typing-state";

function publishChannelTyping(channelId: string, usernames: readonly string[]) {
  useMobileTypingStore.getState().patchChannels((current) =>
    replaceMobileChannelTypingUsers(current, {
      channelId,
      currentUserNames: [],
      now: Date.now(),
      usernames,
    }),
  );
}

function publishDMTyping(conversationId: string, usernames: readonly string[]) {
  useMobileTypingStore.getState().patchDMs((current) =>
    replaceMobileChannelTypingUsers(current, {
      channelId: conversationId,
      currentUserNames: [],
      now: Date.now(),
      usernames,
    }),
  );
}

// Runs after the library's own cleanup hook, so nothing is mounted here and the
// reset needs no `act`.
afterEach(() => {
  useMobileTypingStore.getState().reset();
});

describe("typing state isolation", () => {
  it("moves the channel label without re-rendering unrelated surfaces", async () => {
    const unrelatedRenders: number[] = [];

    function TypingLabel() {
      const { channelTypingLabel } = useMobileChannelTypingLabels("channel-1");
      return <Text testID="typing-label">{channelTypingLabel ?? "-"}</Text>;
    }

    function UnrelatedSurface() {
      unrelatedRenders.push(1);
      return <Text testID="unrelated">unrelated</Text>;
    }

    const view = await render(
      <View>
        <TypingLabel />
        <UnrelatedSurface />
      </View>,
    );

    const rendersBefore = unrelatedRenders.length;
    expect(view.getByTestId("typing-label")).toHaveTextContent("-");

    await act(async () => {
      publishChannelTyping("channel-1", ["ada"]);
    });

    expect(view.getByTestId("typing-label").props.children).not.toBe("-");
    expect(unrelatedRenders.length).toBe(rendersBefore);
  });

  it("keeps a channel's typing users out of another channel's label", async () => {
    function TypingLabel() {
      const { channelTypingLabel, channelTypingUsers } = useMobileChannelTypingLabels("channel-2");
      return (
        <Text testID="typing-label">{`${channelTypingLabel ?? "-"}:${channelTypingUsers.length}`}</Text>
      );
    }

    const view = await render(<TypingLabel />);

    await act(async () => {
      publishChannelTyping("channel-1", ["ada"]);
    });

    expect(view.getByTestId("typing-label")).toHaveTextContent("-:0");
  });

  it("publishes the DM label and the per-row map from the same store", async () => {
    function DMSurfaces() {
      const label = useMobileDMTypingLabel("conversation-1");
      const rows = useMobileDMRowTyping();
      return <Text testID="dm-typing">{`${label ?? "-"}|${Object.keys(rows).join(",")}`}</Text>;
    }

    const view = await render(<DMSurfaces />);
    expect(view.getByTestId("dm-typing")).toHaveTextContent("-|");

    await act(async () => {
      publishDMTyping("conversation-1", ["kaya"]);
    });

    expect(view.getByTestId("dm-typing").props.children).toContain("conversation-1");
  });

  it("clears every surface when the session resets", async () => {
    function TypingLabel() {
      const { channelTypingLabel } = useMobileChannelTypingLabels("channel-1");
      return <Text testID="typing-label">{channelTypingLabel ?? "-"}</Text>;
    }

    const view = await render(<TypingLabel />);
    await act(async () => {
      publishChannelTyping("channel-1", ["ada"]);
    });
    expect(view.getByTestId("typing-label").props.children).not.toBe("-");

    await act(async () => {
      useMobileTypingStore.getState().reset();
    });

    expect(view.getByTestId("typing-label")).toHaveTextContent("-");
  });
});
