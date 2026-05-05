import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSendFriendRequest,
  canStartDirectMessage,
} from "./privacy-policy";

describe("privacy policy helpers", () => {
  it("enforces direct message policies", () => {
    assert.equal(
      canStartDirectMessage("EVERYONE", {
        areFriends: false,
        haveMutualServers: false,
      }),
      true,
    );
    assert.equal(
      canStartDirectMessage("FRIENDS", {
        areFriends: true,
        haveMutualServers: false,
      }),
      true,
    );
    assert.equal(
      canStartDirectMessage("FRIENDS", {
        areFriends: false,
        haveMutualServers: true,
      }),
      false,
    );
    assert.equal(
      canStartDirectMessage("MUTUAL_SERVERS", {
        areFriends: false,
        haveMutualServers: true,
      }),
      true,
    );
    assert.equal(
      canStartDirectMessage("NOBODY", {
        areFriends: true,
        haveMutualServers: true,
      }),
      false,
    );
  });

  it("enforces friend request policies", () => {
    assert.equal(
      canSendFriendRequest("EVERYONE", {
        haveMutualFriends: false,
        haveMutualServers: false,
      }),
      true,
    );
    assert.equal(
      canSendFriendRequest("MUTUAL_FRIENDS", {
        haveMutualFriends: true,
        haveMutualServers: false,
      }),
      true,
    );
    assert.equal(
      canSendFriendRequest("MUTUAL_SERVERS", {
        haveMutualFriends: false,
        haveMutualServers: true,
      }),
      true,
    );
    assert.equal(
      canSendFriendRequest("NOBODY", {
        haveMutualFriends: true,
        haveMutualServers: true,
      }),
      false,
    );
  });
});
