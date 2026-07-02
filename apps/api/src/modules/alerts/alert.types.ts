export type AlertJobType = "warranty_reminder" | "custom_alert";

// "J30" / "J7" / "J1" by default, but users can configure their own offsets
// (e.g. "J90") — the kind is derived from the day count, and feeds the BullMQ
// job id, so it must stay a pure function of the offset.
export type WarrantyReminderKind = `J${number}`;

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

export function reminderKindForDays(days: number): WarrantyReminderKind {
  return `J${days}`;
}

export function reminderKindLabel(kind: WarrantyReminderKind) {
  return `Rappel garantie J-${kind.slice(1)}`;
}
