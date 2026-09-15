import type { ProfileEmojiEntry } from "./profile-emoji-index";
export {
  normalizeEmojiQuery,
  PROFILE_EMOJI_PAGE_SIZE,
  type ProfileEmojiEntry,
} from "./profile-emoji-index";

let catalogPromise: Promise<ProfileEmojiEntry[]> | undefined;
let catalog: ProfileEmojiEntry[] | null = null;

export function getCachedProfileEmojiCatalog(): ProfileEmojiEntry[] | null {
  return catalog;
}

export function loadProfileEmojiCatalog(): Promise<ProfileEmojiEntry[]> {
  // Parsing the dataset and indexing every skin/ZWJ variant must not compete
  // with the dialog's first paint or input handling on the UI thread.
  return (catalogPromise ??= new Promise<ProfileEmojiEntry[]>((resolve, reject) => {
    const worker = new Worker(new URL("./profile-emoji-worker.ts", import.meta.url));
    const fail = () => {
      worker.terminate();
      reject(new Error("Failed to load profile emoji catalog"));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail();
    };
    worker.onmessageerror = fail;
    worker.onmessage = (event: MessageEvent<ProfileEmojiEntry[]>) => {
      catalog = event.data;
      worker.terminate();
      resolve(catalog);
    };
  }).catch((error: unknown) => {
    catalogPromise = undefined;
    throw error;
  }));
}
