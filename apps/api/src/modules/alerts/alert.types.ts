export type AlertJobType = "warranty_reminder";

export type WarrantyReminderKind = "J30" | "J7" | "J1";

export type WarrantyReminderJobPayload = {
  type: "warranty_reminder";
  ownerUserId: number;
  garantieId: number;
  articleId?: number | null;
  reminderKind: WarrantyReminderKind;
  executeAt: string; // ISO
  alerteId: number;
};

export function reminderKindLabel(kind: WarrantyReminderKind) {
  switch (kind) {
    case "J30":
      return "Rappel garantie J-30";
    case "J7":
      return "Rappel garantie J-7";
    case "J1":
      return "Rappel garantie J-1";
  }
}
