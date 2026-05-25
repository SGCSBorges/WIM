import { logger } from "../../config/logger";

// Transactional email via Resend's REST API (no SDK dependency — a single
// HTTPS POST). Mirrors PushService: a no-op that logs when the key/sender
// aren't configured, so reminders still work without email set up.
const API_KEY = process.env.RESEND_API_KEY ?? "";
// e.g. "WIM <reminders@yourdomain.com>" — must be a Resend-verified sender.
const FROM = process.env.MAIL_FROM ?? "";
const APP_URL = process.env.APP_URL?.replace(/\/$/, "") ?? "";

const configured = Boolean(API_KEY && FROM);

export type ReminderEmail = {
  to: string;
  subject: string;
  // Plain-text body; a minimal HTML wrapper is derived from it.
  body: string;
  // Optional in-app path (e.g. "/articles/5") rendered as a link.
  path?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const EmailService = {
  isConfigured: () => configured,

  // Send a reminder email. Never throws — email is best-effort, like push.
  sendReminderEmail: async (msg: ReminderEmail): Promise<void> => {
    if (!configured) return;

    const link =
      msg.path && APP_URL
        ? `<p><a href="${escapeHtml(APP_URL + msg.path)}">Open in WIM</a></p>`
        : "";
    const html = `<div><p>${escapeHtml(msg.body)}</p>${link}</div>`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM,
          to: msg.to,
          subject: msg.subject,
          text:
            msg.path && APP_URL
              ? `${msg.body}\n\n${APP_URL}${msg.path}`
              : msg.body,
          html,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        logger.warn(
          { status: res.status, detail, to: msg.to },
          "[email] send failed"
        );
      }
    } catch (err) {
      logger.warn({ err, to: msg.to }, "[email] send error");
    }
  },
};
