import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldReplyFromMessageDoubleClick } from "./message-item-interactions";

describe("mesaja çift tıklayarak yanıt verme", () => {
  it("normal mesaj gövdesinde yanıtı tetikler", () => {
    assert.equal(
      shouldReplyFromMessageDoubleClick({
        interactiveTarget: false,
        replyable: true,
      }),
      true,
    );
  });

  it("tarayıcının çift tıkla oluşturduğu metin seçimine rağmen yanıtlar", () => {
    assert.equal(
      shouldReplyFromMessageDoubleClick({
        interactiveTarget: false,
        replyable: true,
      }),
      true,
    );
  });

  it("etkileşimli alt öğeleri bozmaz", () => {
    assert.equal(
      shouldReplyFromMessageDoubleClick({
        interactiveTarget: true,
        replyable: true,
      }),
      false,
    );
  });

  it("düzenlenen veya iyimser mesajı yanıtlamaz", () => {
    assert.equal(
      shouldReplyFromMessageDoubleClick({
        interactiveTarget: false,
        replyable: false,
      }),
      false,
    );
  });
});
