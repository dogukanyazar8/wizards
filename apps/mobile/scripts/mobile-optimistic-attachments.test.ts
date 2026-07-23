import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MessageAttachment } from "@wizards/types";
import {
  toMobileOptimisticChannelAttachments,
  toMobileOptimisticDMAttachments,
} from "../src/query/mobile-optimistic-attachments";

const uploadedImage: MessageAttachment = {
  contentType: "image/png",
  filename: "holiday.png",
  height: 1200,
  id: "attachment-image",
  scanStatus: "PENDING",
  size: 2048,
  url: "https://ufs.example.test/holiday.png",
  width: 900,
};

const uploadedFile: MessageAttachment = {
  contentType: "application/pdf",
  filename: "contract.pdf",
  id: "attachment-file",
  size: 4096,
  url: "https://ufs.example.test/contract.pdf",
};

describe("mobile optimistic attachments", () => {
  it("returns an empty list when the send carried no attachments", () => {
    assert.deepEqual(toMobileOptimisticChannelAttachments(undefined), []);
    assert.deepEqual(toMobileOptimisticDMAttachments(undefined), []);
  });

  it("keeps the uploaded channel metadata as-is", () => {
    const attachments = toMobileOptimisticChannelAttachments([uploadedImage]);

    assert.deepEqual(attachments, [uploadedImage]);
    assert.notEqual(attachments[0], undefined);
  });

  it("widens missing DM attachment fields to the payload nulls", () => {
    const [attachment] = toMobileOptimisticDMAttachments([uploadedFile]);

    assert.deepEqual(attachment, {
      contentType: "application/pdf",
      duration: null,
      filename: "contract.pdf",
      height: null,
      id: "attachment-file",
      size: 4096,
      thumbnailUrl: null,
      url: "https://ufs.example.test/contract.pdf",
      width: null,
    });
  });

  it("carries image dimensions and scan status into the DM payload shape", () => {
    const [attachment] = toMobileOptimisticDMAttachments([uploadedImage]);

    assert.equal(attachment?.height, 1200);
    assert.equal(attachment?.width, 900);
    assert.equal(attachment?.scanStatus, "PENDING");
    assert.equal(attachment?.thumbnailUrl, null);
  });
});
