/**
 * The language to write to an email address in. Most senders already hold
 * the recipient's User row and pass `language` straight through; this is
 * for the sites that only have an address (transfer offers, household
 * invites, message notifications), where the recipient may not even be a
 * user yet. Never throws and never blocks a send: any failure — no such
 * user, DB down, a test double without the method — means English.
 *
 * Prisma is imported lazily so the email module stays free of a database
 * dependency for callers (and tests) that never resolve a language.
 */
import { normalizeEmailLang, type EmailLang } from "./email.i18n";

export async function recipientLanguage(email: string): Promise<EmailLang> {
  try {
    const { prisma } = await import("../../libs/prisma");
    const user = await prisma.user.findFirst({
      where: { email },
      select: { language: true },
    });
    return normalizeEmailLang(user?.language);
  } catch {
    return "en";
  }
}
