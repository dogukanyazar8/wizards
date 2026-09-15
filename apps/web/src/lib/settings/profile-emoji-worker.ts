import data, { type EmojiMartData } from "@emoji-mart/data";
import { buildProfileEmojiCatalog } from "./profile-emoji-index";

postMessage(buildProfileEmojiCatalog(data as unknown as EmojiMartData));
