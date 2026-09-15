import { Resend } from "resend";
import { normalizeAppLocale, translate } from "@/lib/locale";
import { heading, paragraph } from "@/lib/email/email-blocks";
import { escapeHtml } from "@/lib/email/email-html";
import { renderEmailShell } from "@/lib/email/email-shell";

export async function sendEmailChangeMail(input: {
  to: string;
  locale: string | null;
  code?: string;
}) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim() || process.env.RESEND_FROM?.trim();
  if (!key || !from) throw new Error("Email change sender is not configured");
  const locale = normalizeAppLocale(input.locale);
  const subject = translate(
    locale,
    input.code ? "settings.contact.mail.codeTitle" : "settings.contact.mail.noticeTitle",
  );
  const body = translate(
    locale,
    input.code ? "settings.contact.mail.codeBody" : "settings.contact.mail.noticeBody",
  );
  const html = renderEmailShell({
    bandLabel: "WHISPR",
    documentTitle: subject,
    locale,
    preheader: body,
    bodyHtml:
      heading(subject) +
      paragraph(escapeHtml(body)) +
      (input.code
        ? paragraph(
            `<strong style="font-size:28px;letter-spacing:6px">${escapeHtml(input.code)}</strong>`,
          )
        : ""),
  });
  const result = await new Resend(key).emails.send({
    from,
    to: input.to,
    subject,
    html,
    text: `${subject}\n\n${body}${input.code ? `\n\n${input.code}` : ""}`,
  });
  if (result.error) throw new Error("Email change delivery failed");
}
