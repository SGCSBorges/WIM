import type { AttachmentType } from "@wim/types";

const KEYS = {
  INVOICE: "attachments.type.invoice",
  WARRANTY: "attachments.type.warranty",
  CLAIM: "attachments.type.claim",
  OTHER: "attachments.type.other",
} as const satisfies Record<AttachmentType, string>;

type AttachmentTypeKey = (typeof KEYS)[AttachmentType];

/** The reader-language name of an attachment's type. The API sends the
 *  enum value; an unknown one (a newer server) is shown as is. */
export function attachmentTypeLabel(
  type: string,
  t: (key: AttachmentTypeKey) => string
): string {
  const key = (KEYS as Record<string, AttachmentTypeKey | undefined>)[type];
  return key ? t(key) : type;
}
