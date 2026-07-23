import { Image, type ImageProps } from "expo-image";

export type MobileCachedImageProps = Omit<ImageProps, "cachePolicy">;

/**
 * Remote images always go through the shared disk+memory cache. `contentFit`
 * stays a caller decision — thumbnails crop, the full-screen viewer letterboxes
 * — but "cover" is what every inline surface wants, so it is the default.
 */
export function MobileCachedImage(props: MobileCachedImageProps) {
  return (
    <Image
      contentFit="cover"
      {...props}
      cachePolicy="memory-disk"
      transition={props.transition ?? 120}
    />
  );
}
