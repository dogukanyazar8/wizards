import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveServerAbbreviation,
  resolveServerIconPresentation,
} from "@/lib/servers/server-icon-presentation";

describe("sunucu ikon kimliği", () => {
  it("addan daima üç karakter üretir", () => {
    assert.equal(deriveServerAbbreviation("Whispr Topluluğu"), "WHI");
    assert.equal(deriveServerAbbreviation("istanbul"), "İST");
    assert.equal(deriveServerAbbreviation(""), "WHS");
  });

  it("yalnız tam üç karakterli kayıtlı kısaltmayı kullanır", () => {
    assert.deepEqual(
      resolveServerIconPresentation({
        iconColor: "danger",
        iconUrl: null,
        name: "Whispr Topluluğu",
        shortName: "wzr",
      }),
      { kind: "fallback", label: "WZR", tone: "danger" },
    );

    for (const legacy of [null, "W", "WZ", "WZRD"]) {
      const presentation = resolveServerIconPresentation({
        iconColor: "success",
        iconUrl: null,
        name: "Whispr Topluluğu",
        shortName: legacy,
      });

      assert.equal(presentation.kind, "fallback");
      assert.equal(presentation.kind === "fallback" ? presentation.label : null, "WHI");
    }
  });

  it("görsel varsa kısaltma ve renk sunumunu devre dışı bırakır", () => {
    assert.deepEqual(
      resolveServerIconPresentation({
        iconColor: "danger",
        iconUrl: "https://cdn.example/icon.png",
        name: "Whispr",
        shortName: "WZR",
      }),
      { imageUrl: "https://cdn.example/icon.png", kind: "image" },
    );
  });
});
