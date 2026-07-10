import { Image, type ImageProps } from "expo-image";

export type MobileCachedImageProps = Omit<ImageProps, "cachePolicy" | "contentFit">;

export function MobileCachedImage(props: MobileCachedImageProps) {
  return (
    <Image
      {...props}
      cachePolicy="memory-disk"
      contentFit="cover"
      transition={props.transition ?? 120}
    />
  );
}
