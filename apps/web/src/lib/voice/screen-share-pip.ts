type PipDocument = {
  pictureInPictureEnabled?: boolean;
  pictureInPictureElement?: Element | null;
  exitPictureInPicture?: () => Promise<void>;
};
type PipWindow = {
  documentPictureInPicture?: {
    requestWindow: (options: { width: number; height: number }) => Promise<Window | object>;
  };
};
export function getPictureInPictureCapabilities(doc: PipDocument, win: PipWindow) {
  return {
    video: doc.pictureInPictureEnabled === true,
    document: typeof win.documentPictureInPicture?.requestWindow === "function",
  };
}
export function enterVideoPictureInPicture(video: HTMLVideoElement) {
  return video.requestPictureInPicture();
}
export async function exitVideoPictureInPicture(doc: PipDocument = document) {
  if (doc.pictureInPictureElement) await doc.exitPictureInPicture?.();
}
export async function openDocumentPictureInPicture(
  options: { width: number; height: number },
  win: PipWindow = window as Window & PipWindow,
): Promise<Window> {
  if (!win.documentPictureInPicture) throw new Error("DOCUMENT_PIP_UNSUPPORTED");
  return (await win.documentPictureInPicture.requestWindow(options)) as Window;
}
