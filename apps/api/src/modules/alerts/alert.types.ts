export type AlertJobType = "warranty_reminder" | "custom_alert";

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

// Fired for user-created (CUSTOM) alerts and for any snoozed alert. The
// processor loads the Alerte row by id, so no warranty context is needed.
export type CustomAlertJobPayload = {
  type: "custom_alert";
  ownerUserId: number;
  alerteId: number;
  executeAt: string; // ISO
};

export type AlertJobPayload =
  | WarrantyReminderJobPayload
  | CustomAlertJobPayload;

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
