import { getExpoFileSystemModule } from "./expo-mobile-media-modules";

export async function deleteMobileTemporaryFile(
  uri: string,
  remove: (uri: string) => void | Promise<void> = (target) => {
    const { File } = getExpoFileSystemModule();
    const file = new File(target);
    if (file.exists) {
      file.delete();
    }
  },
): Promise<boolean> {
  try {
    await remove(uri);
    return true;
  } catch {
    // Cleanup must not replace the upload or recording outcome with a second error.
    return false;
  }
}
