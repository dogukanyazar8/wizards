import React from "react";
import { Text } from "react-native";
import { describe, expect, it } from "@jest/globals";
import {
  MessageBodyText,
  MessageDeliveryTicks,
  MessageReplyQuote,
  MessageTimestampInline,
  MessageTypingDots,
} from "../src/app/components/message-primitives";
import { lightTheme } from "../src/design/themes";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { renderWithMobileTheme } from "./render-with-mobile-theme";

function flatten(style: unknown): Record<string, unknown> {
  const entries = Array.isArray(style) ? style : [style];
  return entries.reduce<Record<string, unknown>>(
    (merged, entry) => (entry ? { ...merged, ...(entry as Record<string, unknown>) } : merged),
    {},
  );
}

describe("messaging redesign body primitives", () => {
  it("keeps the clock on the last line of the body instead of its own row", async () => {
    const view = await renderWithMobileTheme(
      <MessageTimestampInline testID="stamp" timeLabel="09:12">
        <Text>Günaydın</Text>
      </MessageTimestampInline>,
    );
    const style = flatten(view.getByTestId("stamp").props.style);

    // §1.1: `display:flex; align-items:flex-end; gap:9px` — one row, not two.
    expect(style).toMatchObject({ alignItems: "flex-end", flexDirection: "row", gap: 9 });
    expect(view.getByText("09:12")).toBeTruthy();
  });

  it("announces the delivery state instead of relying on the tick colour", async () => {
    // §2 "1a".6.4: three states, and "delivered" and "read" share a glyph — the
    // label is the only thing that separates them for a screen reader.
    const sent = await renderWithMobileTheme(<MessageDeliveryTicks delivery="sent" />);
    expect(sent.getByLabelText(copy.dmChatSentLabel)).toBeTruthy();

    const delivered = await renderWithMobileTheme(<MessageDeliveryTicks delivery="delivered" />);
    expect(delivered.getByLabelText(copy.dmChatDeliveredLabel)).toBeTruthy();

    const read = await renderWithMobileTheme(<MessageDeliveryTicks delivery="read" />);
    expect(read.getByLabelText(copy.dmChatReadLabel)).toBeTruthy();

    // Nothing is drawn until the server has the message.
    const sending = await renderWithMobileTheme(<MessageDeliveryTicks delivery="sending" />);
    expect(sending.queryByLabelText(copy.dmChatSentLabel)).toBeNull();
    expect(sending.queryByLabelText(copy.dmChatDeliveredLabel)).toBeNull();
    expect(sending.queryByLabelText(copy.dmChatReadLabel)).toBeNull();
  });

  it("draws the reply quote as a rule, with no fill and one clipped line", async () => {
    const view = await renderWithMobileTheme(
      <MessageReplyQuote authorName="Sen" excerpt="Süper, ben de demo ortamını…" testID="quote" />,
    );
    const style = flatten(view.getByTestId("quote").props.style);

    expect(style).toMatchObject({
      borderLeftColor: lightTheme.messaging.replyQuoteRule,
      borderLeftWidth: 2.5,
      marginBottom: 6,
      paddingLeft: 8,
    });
    // §9: a padded/boxed quote is explicitly out.
    expect(style.backgroundColor).toBeUndefined();
    expect(style.borderRadius).toBeUndefined();
    expect(view.getByText("Süper, ben de demo ortamını…").props.numberOfLines).toBe(1);
  });

  it("switches the quote to the outgoing bubble's own foreground", async () => {
    const view = await renderWithMobileTheme(
      <MessageReplyQuote authorName="Sen" excerpt="…" outgoing testID="quote" />,
    );

    expect(flatten(view.getByTestId("quote").props.style).borderLeftColor).toBe(
      lightTheme.messaging.bubbleOutQuote,
    );
    expect(flatten(view.getByText("Sen").props.style).color).toBe(
      lightTheme.messaging.bubbleOutQuote,
    );
  });

  it("renders three typing dots in both the bubble and the compact form", async () => {
    const bubble = await renderWithMobileTheme(<MessageTypingDots testID="typing" />);
    const bubbleDots = bubble.getByTestId("typing").children;
    expect(bubbleDots).toHaveLength(3);
    expect(flatten((bubbleDots[0] as { props: { style: unknown } }).props.style)).toMatchObject({
      backgroundColor: lightTheme.messaging.typingDot,
      height: 6,
      opacity: 1,
      width: 6,
    });

    const compact = await renderWithMobileTheme(<MessageTypingDots compact testID="typing" />);
    const compactDots = compact.getByTestId("typing").children;
    expect(flatten((compactDots[2] as { props: { style: unknown } }).props.style)).toMatchObject({
      backgroundColor: lightTheme.messaging.accent,
      height: 5,
      opacity: 0.35,
      width: 5,
    });
  });

  it("sizes every body through the message preference, per surface", async () => {
    const dm = await renderWithMobileTheme(
      <MessageBodyText body="Günaydın" channel={false} testID="body" />,
    );
    const channel = await renderWithMobileTheme(
      <MessageBodyText body="Günaydın" channel testID="body" />,
    );

    expect(flatten(dm.getByTestId("body").props.style)).toMatchObject({
      fontSize: 15,
      lineHeight: 21.3,
    });
    expect(flatten(channel.getByTestId("body").props.style)).toMatchObject({
      fontSize: 15,
      lineHeight: 21.75,
    });
  });
});
