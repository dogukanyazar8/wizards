import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MESSAGES_FRIENDS_ROUTE,
  MESSAGES_ROUTE,
  clearMessagesActionHref,
  isMessagesRoute,
  messagesConversationHref,
  selectActiveConversationId,
  toMessagesRedirect,
} from "./routes";

describe("clearMessagesActionHref", () => {
  it("grup penceresini kapatırken diğer Arkadaşlar sorgularını korur", () => {
    assert.equal(
      clearMessagesActionHref("dmAction=group&dmTab=pending&profile=user-1"),
      "/messages/friends?dmTab=pending&profile=user-1",
    );
  });

  it("başka sorgu yoksa temiz Arkadaşlar yoluna döner", () => {
    assert.equal(clearMessagesActionHref("dmAction=group"), MESSAGES_FRIENDS_ROUTE);
  });
});

describe("messagesConversationHref", () => {
  it("kimliği kodlar", () => {
    assert.equal(messagesConversationHref("conv-1"), "/messages/conv-1");
    assert.equal(messagesConversationHref("a b"), "/messages/a%20b");
  });

  it("sorgu dizesini ekler", () => {
    assert.equal(
      messagesConversationHref("conv-1", { message: "m-9" }),
      "/messages/conv-1?message=m-9",
    );
  });
});

describe("selectActiveConversationId", () => {
  it("konuşma kimliğini verir", () => {
    assert.equal(selectActiveConversationId("/messages/conv-1"), "conv-1");
    assert.equal(selectActiveConversationId("/messages/conv-1/"), "conv-1");
  });

  /**
   * `friends` **statik** bir segment; App Router onu dinamik olandan önce
   * eşleştiriyor ve ray onu bir sohbet sanmamalı.
   */
  it("ayrılmış segmenti kimlik saymaz", () => {
    assert.equal(selectActiveConversationId(MESSAGES_FRIENDS_ROUTE), null);
  });

  it("kök ve başka ekranlarda null", () => {
    assert.equal(selectActiveConversationId(MESSAGES_ROUTE), null);
    assert.equal(selectActiveConversationId("/home"), null);
    assert.equal(selectActiveConversationId("/channels/server-1/channel-1"), null);
  });

  it("yüzde kodlu segmenti çözer", () => {
    assert.equal(selectActiveConversationId("/messages/a%20b"), "a b");
  });

  /** Bozuk kodlama gerçek bir kimlik olamaz ama çökmemeli. */
  it("bozuk kodlamada ham segmenti verir", () => {
    assert.equal(selectActiveConversationId("/messages/%E0%A4%A"), "%E0%A4%A");
  });
});

describe("isMessagesRoute", () => {
  it("Mesajlar ağacını tanır", () => {
    assert.equal(isMessagesRoute(MESSAGES_ROUTE), true);
    assert.equal(isMessagesRoute(MESSAGES_FRIENDS_ROUTE), true);
    assert.equal(isMessagesRoute("/messages/conv-1"), true);
    assert.equal(isMessagesRoute("/home"), false);
  });
});

describe("toMessagesRedirect", () => {
  it("kimlikli eski yolu sohbete taşır", () => {
    assert.equal(toMessagesRedirect("conv-1"), "/messages/conv-1");
  });

  /**
   * Sorgu düşerse kullanıcı hedefe değil hedefin listesine iner; `?message=`
   * bağlantıları bugün dolaşımda.
   */
  it("sorgu dizesini korur", () => {
    assert.equal(toMessagesRedirect("conv-1", { message: "m-9" }), "/messages/conv-1?message=m-9");
  });

  it("dmTab kimlik yokken Arkadaşlar'a iner", () => {
    assert.equal(toMessagesRedirect(null, { dmTab: "pending" }), "/messages/friends?dmTab=pending");
  });

  it("kimlik ve sorgu yokken köke iner", () => {
    assert.equal(toMessagesRedirect(null), "/messages");
  });

  it("çok değerli sorguyu kaybetmez", () => {
    assert.equal(toMessagesRedirect(null, { tag: ["a", "b"] }), "/messages?tag=a&tag=b");
  });
});
