import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  csvEscape,
  normalizeAdminManagementPagination,
  parseAdminBoolean,
  toCsv,
} from "@/lib/admin/management";

describe("admin management helpers", () => {
  it("normalizes pagination safely", () => {
    assert.deepEqual(normalizeAdminManagementPagination({ limit: "25", page: "3" }), {
      limit: 25,
      page: 3,
      skip: 50,
    });
    assert.deepEqual(normalizeAdminManagementPagination({ limit: "500", page: "-4" }), {
      limit: 100,
      page: 1,
      skip: 0,
    });
  });

  it("parses boolean filters without guessing", () => {
    assert.equal(parseAdminBoolean("true"), true);
    assert.equal(parseAdminBoolean("false"), false);
    assert.equal(parseAdminBoolean("yes"), null);
    assert.equal(parseAdminBoolean(null), null);
  });

  it("escapes CSV cells", () => {
    assert.equal(csvEscape("plain"), "plain");
    assert.equal(csvEscape("hello, world"), '"hello, world"');
    assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
    assert.equal(
      toCsv(
        ["name", "count"],
        [
          ["alpha", 2],
          ["beta,gamma", 4],
        ],
      ),
      'name,count\nalpha,2\n"beta,gamma",4',
    );
  });
});
