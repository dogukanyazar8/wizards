import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMobileForegroundContentCheckpoint } from "../src/performance/mobile-foreground-content";

describe("mobile foreground content checkpoint", () => {
  it("signals only after the visible overview reaches the interaction queue", () => {
    const callbacks: (() => void)[] = [];
    const signals: string[] = [];
    const checkpoint = createMobileForegroundContentCheckpoint({
      runAfterInteractions(callback) {
        callbacks.push(callback);
        return { cancel: () => undefined };
      },
      signalContentVisible: () => signals.push("visible"),
    });

    checkpoint.observeAppState("background");
    assert.deepEqual(signals, []);
    checkpoint.observeAppState("active");
    assert.deepEqual(signals, []);
    assert.equal(callbacks.length, 1);
    callbacks[0]!();
    assert.deepEqual(signals, ["visible"]);
  });

  it("cancels a stale foreground callback before another active checkpoint", () => {
    const cancellations: number[] = [];
    const callbacks: (() => void)[] = [];
    const checkpoint = createMobileForegroundContentCheckpoint({
      runAfterInteractions(callback) {
        callbacks.push(callback);
        return { cancel: () => cancellations.push(callbacks.length) };
      },
      signalContentVisible: () => undefined,
    });

    checkpoint.observeAppState("active");
    checkpoint.observeAppState("active");
    checkpoint.dispose();

    assert.deepEqual(cancellations, [1, 2]);
  });

  it("does not signal a foreground callback after the app backgrounds again", () => {
    const callbacks: (() => void)[] = [];
    const cancellations: number[] = [];
    const signals: string[] = [];
    const checkpoint = createMobileForegroundContentCheckpoint({
      runAfterInteractions(callback) {
        callbacks.push(callback);
        return { cancel: () => cancellations.push(callbacks.length) };
      },
      signalContentVisible: () => signals.push("visible"),
    });

    checkpoint.observeAppState("active");
    checkpoint.observeAppState("background");
    callbacks[0]!();

    assert.deepEqual(cancellations, [1]);
    assert.deepEqual(signals, []);
  });

  it("waits for the privacy shield to uncover after the overview is interaction-ready", () => {
    const callbacks: (() => void)[] = [];
    const signals: string[] = [];
    let covered = true;
    let onUncovered: () => void = () => undefined;
    const checkpoint = createMobileForegroundContentCheckpoint({
      isPrivacyShieldCovered: () => covered,
      observePrivacyShieldUncovered(listener) {
        onUncovered = listener;
        return () => {
          onUncovered = () => undefined;
        };
      },
      runAfterInteractions(callback) {
        callbacks.push(callback);
        return { cancel: () => undefined };
      },
      signalContentVisible: () => signals.push("visible"),
    });

    checkpoint.observeAppState("active");
    callbacks[0]!();
    assert.deepEqual(signals, []);

    covered = false;
    onUncovered();
    assert.deepEqual(signals, ["visible"]);
  });
});
