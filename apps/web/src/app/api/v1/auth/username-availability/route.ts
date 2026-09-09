import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, parseJsonBody } from "@/lib/api";
import { checkRegistrationRequestRateLimit } from "@/lib/auth/request-rate-limits";
import { checkUsernameAvailability } from "@/lib/auth/username-availability";

/**
 * SPEC-GIRIS-KAYIT §10 — kullanıcı adı alanı bırakıldığında sorulur.
 *
 * Uç **kimlik doğrulamasızdır**: kayıt formundan, oturum açılmadan çağrılıyor. Bu yüzden kayıt
 * hız sınırının arkasında durur — aksi hâlde kullanıcı adı sözlüğü sınırsız taranabilirdi.
 */
const UsernameAvailabilityRequestSchema = z.object({
  username: z.string().max(64),
});

export async function POST(request: NextRequest) {
  try {
    const input = await parseJsonBody(request, UsernameAvailabilityRequestSchema);
    const isAllowed = await checkRegistrationRequestRateLimit({
      email: `username:${input.username.toLowerCase()}`,
      headers: request.headers,
    });

    if (!isAllowed) {
      return NextResponse.json(
        { available: false, error: "auth.register.rateLimited", suggestions: [], valid: true },
        { headers: { "Cache-Control": "no-store" }, status: 429 },
      );
    }

    const result = await checkUsernameAvailability(input.username);
    const response = NextResponse.json(result);
    response.headers.set("Cache-Control", "no-store");

    return response;
  } catch (error) {
    return jsonError(error);
  }
}
