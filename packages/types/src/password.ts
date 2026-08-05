export const BCRYPT_PASSWORD_MAX_BYTES = 72;

export function getUtf8ByteLength(value: string): number {
  let byteLength = 0;

  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }

    byteLength += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }

  return byteLength;
}

export function isBcryptPasswordWithinLimit(value: string): boolean {
  return getUtf8ByteLength(value) <= BCRYPT_PASSWORD_MAX_BYTES;
}
