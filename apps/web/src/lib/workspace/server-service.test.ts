import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertServerIsDeletableByOwner,
  assertVisibilityFieldsWritable,
  buildServerCreateData,
} from "@/lib/workspace/server-service";

const BASE_INPUT = {
  allowFileUploads: true,
  allowGifs: true,
  allowMemberAdds: true,
  description: null,
  iconUrl: null,
  name: "Test sunucu",
  shortName: null,
};

describe("buildServerCreateData", () => {
  it("defaults to a private personal server when no options are given", () => {
    const data = buildServerCreateData("u1", BASE_INPUT, "abcd1234");

    assert.equal(data.type, "PERSONAL");
    assert.equal(data.isPublic, false);
    assert.equal(data.discoverable, false);
    assert.equal(data.ownerId, "u1");
  });

  it("applies the privileged options the admin surface passes", () => {
    const data = buildServerCreateData("u1", BASE_INPUT, "abcd1234", {
      discoverable: true,
      isPublic: true,
      type: "COMMUNITY",
    });

    assert.equal(data.type, "COMMUNITY");
    assert.equal(data.isPublic, true);
    assert.equal(data.discoverable, true);
  });

  it("starts the member counter at one for the founding member", () => {
    const data = buildServerCreateData("u1", BASE_INPUT, "abcd1234");

    assert.equal(data.memberCount, 1);
  });
});

describe("community server protection", () => {
  it("lets an owner delete a personal server", () => {
    assert.doesNotThrow(() => assertServerIsDeletableByOwner("PERSONAL"));
  });

  it("refuses owner deletion of a community server", () => {
    assert.throws(() => assertServerIsDeletableByOwner("COMMUNITY"), /403|admin/i);
  });

  it("lets a personal server owner flip visibility", () => {
    assert.doesNotThrow(() =>
      assertVisibilityFieldsWritable("PERSONAL", { discoverable: true, isPublic: true }),
    );
  });

  it("refuses visibility writes on a community server", () => {
    assert.throws(() => assertVisibilityFieldsWritable("COMMUNITY", { isPublic: false }));
    assert.throws(() => assertVisibilityFieldsWritable("COMMUNITY", { discoverable: false }));
  });

  it("allows unrelated community updates to pass through", () => {
    assert.doesNotThrow(() => assertVisibilityFieldsWritable("COMMUNITY", {}));
  });
});
