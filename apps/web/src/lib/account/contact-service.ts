import { prisma } from "@wizards/db";
import { PhoneNumberSchema } from "./contact-contract";
import { maskPhoneNumber } from "./service";

export async function saveAccountPhone(userId: string, raw: unknown) {
  const phoneNumber = PhoneNumberSchema.parse(raw);
  await prisma.user.update({
    where: { id: userId, isBanned: false, deletedAt: null },
    data: { phoneNumber, phoneVerified: false },
  });
  return { phone: maskPhoneNumber(phoneNumber) };
}
