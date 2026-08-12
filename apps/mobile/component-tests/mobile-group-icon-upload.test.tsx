const mockUploadFiles = jest.fn();
const mockPickMobileImage = jest.fn();

jest.mock("@uploadthing/react/native", () => ({
  generateReactHelpers: () => ({ uploadFiles: mockUploadFiles }),
}));

jest.mock("../src/media/mobile-image-picker", () => ({
  pickMobileImage: () => mockPickMobileImage(),
}));

import {
  pickAndUploadMobileGroupIcon,
  uploadMobileGroupIcon,
} from "../src/dm/mobile-group-icon-upload";

const file = { name: "group.png", size: 12, type: "image/png" } as unknown as File;

describe("Faz 5 group icon upload", () => {
  beforeEach(() => {
    mockUploadFiles.mockReset();
    mockPickMobileImage.mockReset();
  });

  it("uploads through the shared web uploader with a bearer token", async () => {
    mockUploadFiles.mockResolvedValue([{ serverData: { url: "https://utfs.io/f/group.png" } }]);

    const url = await uploadMobileGroupIcon({
      accessToken: "token-1",
      conversationId: "dm-group-1",
      file,
    });

    expect(url).toBe("https://utfs.io/f/group.png");
    expect(mockUploadFiles).toHaveBeenCalledWith("groupIconUploader", {
      files: [file],
      headers: { Authorization: "Bearer token-1" },
      input: { conversationId: "dm-group-1" },
    });
  });

  it("sends a null conversation id while the group does not exist yet", async () => {
    mockUploadFiles.mockResolvedValue([{ serverData: { url: "https://utfs.io/f/group.png" } }]);

    await uploadMobileGroupIcon({ accessToken: "token-1", file });

    expect(mockUploadFiles.mock.calls[0]?.[1].input).toEqual({ conversationId: null });
  });

  it("refuses a non-https url rather than handing it to the create request", async () => {
    mockUploadFiles.mockResolvedValue([{ serverData: { url: "http://utfs.io/f/group.png" } }]);

    expect(await uploadMobileGroupIcon({ accessToken: "token-1", file })).toBeNull();
  });

  /**
   * Backing out and failing are two different answers: only one of them earns
   * the reader a message, so the caller has to be able to tell them apart.
   */
  it("reports a cancelled picker as cancelled, without asking for a token", async () => {
    mockPickMobileImage.mockResolvedValue(null);
    const getAccessToken = jest.fn();
    const onUploadStart = jest.fn();

    expect(await pickAndUploadMobileGroupIcon({ getAccessToken, onUploadStart })).toEqual({
      status: "cancelled",
    });
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(onUploadStart).not.toHaveBeenCalled();
    expect(mockUploadFiles).not.toHaveBeenCalled();
  });

  it("reports a missing access token as an error, not as a cancellation", async () => {
    mockPickMobileImage.mockResolvedValue({ file, localUri: "file:///group.png" });

    expect(await pickAndUploadMobileGroupIcon({ getAccessToken: async () => null })).toEqual({
      status: "error",
    });
    expect(mockUploadFiles).not.toHaveBeenCalled();
  });

  it("announces the upload only once a file is in hand", async () => {
    mockPickMobileImage.mockResolvedValue({ file, localUri: "file:///group.png" });
    mockUploadFiles.mockResolvedValue([{ serverData: { url: "https://utfs.io/f/group.png" } }]);
    const onUploadStart = jest.fn();

    expect(
      await pickAndUploadMobileGroupIcon({ getAccessToken: async () => "token-1", onUploadStart }),
    ).toEqual({ status: "uploaded", url: "https://utfs.io/f/group.png" });
    expect(onUploadStart).toHaveBeenCalledTimes(1);
  });

  it("turns a thrown upload into an error the caller can report", async () => {
    mockPickMobileImage.mockResolvedValue({ file, localUri: "file:///group.png" });
    mockUploadFiles.mockRejectedValue(new Error("network"));

    expect(await pickAndUploadMobileGroupIcon({ getAccessToken: async () => "token-1" })).toEqual({
      status: "error",
    });
  });
});
