import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  csvEscape,
  listAdminServers,
  normalizeAdminManagementPagination,
  parseAdminBoolean,
  toCsv,
} from "@/lib/admin/management";

describe("admin management helpers", () => {
  it("bounds nested channel previews before rows reach Node", async () => {
    let serverQuery: Record<string, unknown> | null = null;
    const client = {
      channel: { groupBy: async () => [] },
      server: {
        count: async () => 0,
        findMany: async (args: Record<string, unknown>) => {
          serverQuery = args;
          return [];
        },
      },
    } as never;

    const result = await listAdminServers({}, client);

    assert.deepEqual(result.servers, []);
    assert.equal(
      (serverQuery as unknown as { select: { channels: { take: number } } }).select.channels.take,
      12,
    );
  });

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
