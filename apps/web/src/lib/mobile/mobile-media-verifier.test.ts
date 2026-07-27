import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { ApiError } from "@/lib/api";
import {
  MOBILE_IMAGE_FETCH_TIMEOUT_MS,
  isTransientMobileImageVerificationFailure,
  type MobileImageVerifierDependencies,
  verifyMobileUploadedImage,
} from "./mobile-media-verifier";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const STORAGE_KEY = "mobile-image-key";
const TEST_SIGNAL = new AbortController().signal;

type ChunkedResponse = {
  getReadCount: () => number;
  response: Response;
};

function createChunkedResponse(
  chunks: readonly Uint8Array[],
  options: { contentLength?: number; contentType?: string; status?: number } = {},
): ChunkedResponse {
  let readCount = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[readCount];
        readCount += 1;
        if (chunk) {
          controller.enqueue(chunk);
          return;
        }
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const headers = new Headers();
  if (options.contentLength !== undefined) {
    headers.set("content-length", String(options.contentLength));
  }
  if (options.contentType !== undefined) {
    headers.set("content-type", options.contentType);
  }

  return {
    getReadCount: () => readCount,
    response: new Response(stream, { headers, status: options.status ?? 200 }),
  };
}

function createDependencies(
  response: Response,
  overrides: Partial<MobileImageVerifierDependencies> = {},
): MobileImageVerifierDependencies {
  return {
    createTimeoutSignal: () => TEST_SIGNAL,
    fetch: async () => response,
    ...overrides,
  };
}

function createInput(
  bytes: Uint8Array,
  overrides: Partial<{ key: string; size: number; type: string; url: string }> = {},
) {
  return {
    key: STORAGE_KEY,
    size: bytes.byteLength,
    type: "image/png",
    url: `https://utfs.io/f/${STORAGE_KEY}`,
    ...overrides,
  };
}

async function expectApiError(
  promise: Promise<unknown>,
  code: "UPLOAD_IMAGE_INVALID" | "UPLOAD_SOURCE_INVALID" | "UPLOAD_TOO_LARGE",
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, code);
    assert.ok(error.message.length <= 80);
    assert.doesNotMatch(error.message, /mobile-image-key|utfs\.io/i);
    return true;
  });
}

async function createPng(width: number, height: number) {
  return sharp({
    create: {
      background: { alpha: 1, b: 34, g: 51, r: 17 },
      channels: 4,
      height,
      width,
    },
  })
    .png()
    .toBuffer();
}

describe("verifyMobileUploadedImage", () => {
  it("accepts UploadThing-owned HTTPS hosts and exact callback keys", async () => {
    const png = await createPng(1, 1);
    const hosts = [
      "utfs.io",
      "ufs.sh",
      "tenant.ufs.sh",
      "uploadthing.com",
      "tenant.uploadthing.com",
    ];

    for (const host of hosts) {
      const { response } = createChunkedResponse([png]);
      const result = await verifyMobileUploadedImage(
        createInput(png, { url: `https://${host}/f/${STORAGE_KEY}` }),
        createDependencies(response),
      );

      assert.equal(result.storageKey, STORAGE_KEY);
      assert.equal(result.url, `https://${host}/f/${STORAGE_KEY}`);
    }
  });

  it("rejects non-HTTPS, non-UploadThing, lookalike, and callback-key-mismatched sources before fetch", async () => {
    const png = await createPng(1, 1);
    const rejectedUrls = [
      `http://utfs.io/f/${STORAGE_KEY}`,
      `https://cdn.example.com/f/${STORAGE_KEY}`,
      `https://ufs.sh.example.com/f/${STORAGE_KEY}`,
      "https://utfs.io/f/different-key",
    ];
    let fetchCalls = 0;
    const { response } = createChunkedResponse([png]);
    const dependencies = createDependencies(response, {
      fetch: async () => {
        fetchCalls += 1;
        return response;
      },
    });

    for (const url of rejectedUrls) {
      await expectApiError(
        verifyMobileUploadedImage(createInput(png, { url }), dependencies),
        "UPLOAD_SOURCE_INVALID",
      );
    }

    assert.equal(fetchCalls, 0);
  });

  /**
   * The upload the client is waiting on is finished by this callback, so a
   * source that is merely slow or briefly unreachable must be reported as
   * temporary. Reporting it as invalid made the caller delete the object, which
   * turned one slow fetch into a permanently failing retry.
   */
  it("separates a source that is temporarily unavailable from one that is invalid", async () => {
    const png = await createPng(1, 1);
    const transientCases: MobileImageVerifierDependencies[] = [
      {
        createTimeoutSignal: () => TEST_SIGNAL,
        fetch: async () => {
          throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
        },
      },
      {
        createTimeoutSignal: () => TEST_SIGNAL,
        fetch: async () => createChunkedResponse([png], { status: 503 }).response,
      },
      {
        createTimeoutSignal: () => TEST_SIGNAL,
        fetch: async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              pull() {
                throw new Error("connection reset");
              },
            }),
            { status: 200 },
          ),
      },
    ];

    for (const dependencies of transientCases) {
      await assert.rejects(
        verifyMobileUploadedImage(createInput(png), dependencies),
        (error: unknown) => {
          assert.ok(error instanceof ApiError);
          assert.equal(error.code, "UPLOAD_SOURCE_UNAVAILABLE");
          assert.equal(error.status, 503);
          assert.equal(isTransientMobileImageVerificationFailure(error), true);
          return true;
        },
      );
    }

    // A structurally wrong source stays a permanent rejection.
    const { response } = createChunkedResponse([png]);
    await expectApiError(
      verifyMobileUploadedImage(
        createInput(png, { url: `https://cdn.example.com/f/${STORAGE_KEY}` }),
        createDependencies(response),
      ),
      "UPLOAD_SOURCE_INVALID",
    );
    assert.equal(
      isTransientMobileImageVerificationFailure(
        new ApiError("bad image", 422, "UPLOAD_IMAGE_INVALID"),
      ),
      false,
    );
  });

  it("disables redirects and gives the source a bounded budget", async () => {
    const png = await createPng(1, 1);
    const { response } = createChunkedResponse([png]);
    let requestedUrl: string | URL | Request | undefined;
    let requestInit: RequestInit | undefined;
    let timeoutMs: number | undefined;

    await verifyMobileUploadedImage(createInput(png), {
      createTimeoutSignal(milliseconds) {
        timeoutMs = milliseconds;
        return TEST_SIGNAL;
      },
      fetch: async (url, init) => {
        requestedUrl = url;
        requestInit = init;
        return response;
      },
    });

    assert.equal(requestedUrl, `https://utfs.io/f/${STORAGE_KEY}`);
    assert.equal(requestInit?.redirect, "error");
    assert.equal(requestInit?.signal, TEST_SIGNAL);
    assert.equal(timeoutMs, MOBILE_IMAGE_FETCH_TIMEOUT_MS);
    // The budget covers the body stream too, so it has to fit a 4 MB image on a
    // slow hop, not just the response headers.
    assert.ok(MOBILE_IMAGE_FETCH_TIMEOUT_MS >= 15_000);
  });

  it("rejects an oversized callback or Content-Length before reading the response", async () => {
    const png = await createPng(1, 1);
    const oversized = createChunkedResponse([png], {
      contentLength: MAX_IMAGE_BYTES + 1,
    });

    await expectApiError(
      verifyMobileUploadedImage(
        createInput(png, { size: MAX_IMAGE_BYTES + 1 }),
        createDependencies(oversized.response),
      ),
      "UPLOAD_TOO_LARGE",
    );
    await expectApiError(
      verifyMobileUploadedImage(createInput(png), createDependencies(oversized.response)),
      "UPLOAD_TOO_LARGE",
    );
    assert.equal(oversized.getReadCount(), 0);
  });

  it("stops streamed reads at four MiB plus one byte", async () => {
    const response = createChunkedResponse([
      new Uint8Array(MAX_IMAGE_BYTES),
      new Uint8Array(1),
      new Uint8Array(MAX_IMAGE_BYTES),
    ]);

    await expectApiError(
      verifyMobileUploadedImage(
        createInput(new Uint8Array(0)),
        createDependencies(response.response),
      ),
      "UPLOAD_TOO_LARGE",
    );
    assert.equal(response.getReadCount(), 2);
  });

  it("rejects truncated pixel data even when Sharp can read its header", async () => {
    const jpeg = await sharp({
      create: {
        background: { b: 0, g: 0, r: 255 },
        channels: 3,
        height: 64,
        width: 64,
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
    const truncated = jpeg.subarray(0, Math.floor(jpeg.byteLength * 0.9));
    const metadata = await sharp(truncated, {
      failOn: "error",
      limitInputPixels: 16_000_000,
    }).metadata();
    assert.equal(metadata.format, "jpeg");
    await assert.rejects(
      sharp(truncated, { failOn: "error", limitInputPixels: 16_000_000 }).stats(),
    );
    const { response } = createChunkedResponse([truncated]);

    await expectApiError(
      verifyMobileUploadedImage(
        createInput(truncated, { type: "image/jpeg" }),
        createDependencies(response),
      ),
      "UPLOAD_IMAGE_INVALID",
    );
  });

  it("rejects a multi-frame WebP with corruption after its first decodable frame", async () => {
    const width = 16;
    const frameHeight = 16;
    const pages = 6;
    const channels = 4;
    const raw = Buffer.alloc(width * frameHeight * pages * channels);

    for (let page = 0; page < pages; page += 1) {
      const start = page * width * frameHeight * channels;
      const end = (page + 1) * width * frameHeight * channels;
      for (let offset = start; offset < end; offset += channels) {
        raw[offset] = (page * 41) % 256;
        raw[offset + 1] = (page * 83) % 256;
        raw[offset + 2] = (page * 127) % 256;
        raw[offset + 3] = 255;
      }
    }

    const animated = await sharp(raw, {
      raw: {
        channels,
        height: frameHeight * pages,
        pageHeight: frameHeight,
        width,
      },
    })
      .webp({ delay: Array<number>(pages).fill(100), loop: 0, lossless: true })
      .toBuffer();
    const corrupt = Buffer.from(animated);
    const corruptByte = corrupt[127];
    assert.ok(corruptByte !== undefined);
    corrupt[127] = corruptByte ^ 0xff;
    const options = { failOn: "error", limitInputPixels: 16_000_000 } as const;
    const metadata = await sharp(corrupt, options).metadata();
    assert.equal(metadata.pages, pages);
    await sharp(corrupt, options).stats();
    await assert.rejects(sharp(corrupt, { ...options, pages: -1 }).stats());
    const { response } = createChunkedResponse([corrupt], {
      contentType: "image/webp",
    });

    await expectApiError(
      verifyMobileUploadedImage(
        createInput(corrupt, { type: "image/webp" }),
        createDependencies(response),
      ),
      "UPLOAD_IMAGE_INVALID",
    );
  });

  it("requires the callback MIME to match the decoded image format", async () => {
    const png = await createPng(1, 1);
    const { response } = createChunkedResponse([png]);

    await expectApiError(
      verifyMobileUploadedImage(
        createInput(png, { type: "image/jpeg" }),
        createDependencies(response),
      ),
      "UPLOAD_IMAGE_INVALID",
    );
  });

  it("accepts absent and generic response Content-Type headers", async () => {
    const png = await createPng(1, 1);

    for (const options of [{}, { contentType: "application/octet-stream" }] as const) {
      const { response } = createChunkedResponse([png], options);
      const result = await verifyMobileUploadedImage(
        createInput(png),
        createDependencies(response),
      );
      assert.equal(result.contentType, "image/png");
    }
  });

  it("rejects a conflicting specific response Content-Type", async () => {
    const png = await createPng(1, 1);
    const { response } = createChunkedResponse([png], {
      contentType: "image/jpeg; charset=binary",
    });

    await expectApiError(
      verifyMobileUploadedImage(createInput(png), createDependencies(response)),
      "UPLOAD_IMAGE_INVALID",
    );
  });

  it("enforces the 4096-pixel edge boundary", async () => {
    const atLimit = await createPng(4_096, 1);
    const accepted = createChunkedResponse([atLimit]);
    const result = await verifyMobileUploadedImage(
      createInput(atLimit),
      createDependencies(accepted.response),
    );
    assert.equal(result.width, 4_096);

    const overLimit = await createPng(4_097, 1);
    const rejected = createChunkedResponse([overLimit]);
    await expectApiError(
      verifyMobileUploadedImage(createInput(overLimit), createDependencies(rejected.response)),
      "UPLOAD_IMAGE_INVALID",
    );
  });

  it("rejects decoded image areas above 16 megapixels", async () => {
    const overLimit = await createPng(4_001, 4_000);
    const { response } = createChunkedResponse([overLimit]);

    await expectApiError(
      verifyMobileUploadedImage(createInput(overLimit), createDependencies(response)),
      "UPLOAD_IMAGE_INVALID",
    );
  });

  it("returns verified dimensions, decoded MIME, actual byte size, key, and URL for a 1x1 PNG", async () => {
    const png = await createPng(1, 1);
    const { response } = createChunkedResponse([png], {
      contentLength: png.byteLength,
      contentType: "image/png",
    });
    const input = createInput(png);

    const result = await verifyMobileUploadedImage(input, createDependencies(response));

    assert.deepEqual(result, {
      contentType: "image/png",
      height: 1,
      sizeBytes: png.byteLength,
      storageKey: STORAGE_KEY,
      url: input.url,
      width: 1,
    });
  });
});
