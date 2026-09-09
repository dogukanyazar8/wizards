import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatSplashVersionLine, resolveSplashEnvironment } from "@wizards/types";

import {
  buildSplashVersionInfo,
  getSplashEnvironment,
  getSplashVersionInfo,
  getSplashVersionLine,
} from "./splash-identity";

describe("buildSplashVersionInfo", () => {
  it("keeps every part when the deployment sets them", () => {
    assert.deepEqual(
      buildSplashVersionInfo({ buildNumber: "1204", codename: "Resonance", version: "2.5.0-rc3" }),
      { buildNumber: "1204", codename: "Resonance", version: "2.5.0-rc3" },
    );
  });

  it("drops the parts the deployment left empty", () => {
    assert.deepEqual(
      buildSplashVersionInfo({ buildNumber: "", codename: "Echo", version: "0.8.15" }),
      {
        codename: "Echo",
        version: "0.8.15",
      },
    );
    assert.deepEqual(
      buildSplashVersionInfo({ buildNumber: "  ", codename: "  ", version: " 0.8.15 " }),
      { version: "0.8.15" },
    );
  });

  it("renders a line without an empty bracket", () => {
    const line = formatSplashVersionLine(
      buildSplashVersionInfo({ buildNumber: "", codename: "Echo", version: "0.8.15" }),
    );

    assert.equal(line, "Whispr 0.8.15 · Echo");
    assert.ok(!line.includes("()"));
  });
});

describe("splash identity from the build", () => {
  it("produces a line that matches the SPEC shape", () => {
    const info = getSplashVersionInfo();
    const line = getSplashVersionLine();

    assert.equal(line, formatSplashVersionLine(info));
    assert.match(line, /^Whispr \S+( \(\S+\))?( · .+)?$/u);
  });

  it("resolves the environment badge from the release channel", () => {
    const environment = getSplashEnvironment();

    assert.ok(environment === "prod" || environment === "uat");
    // Varsayılan kanal ("beta") PROD rozetini asla açmaz.
    assert.equal(resolveSplashEnvironment("beta"), "uat");
  });
});
