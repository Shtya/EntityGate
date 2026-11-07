import "server-only";
import { appUrl } from "@/lib/app-url";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/server/db";
import en from "../../../../messages/en.json";

let transport: Transporter | null | undefined;
function mailer() {
  if (transport === undefined) transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  return transport;
}

function fill(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ""));
}

/**
 * Records every attempt, so "did they get told?" has an answer. Without SMTP_URL the delivery
 * is logged as skipped: in-app notifications still work, and nobody is mailed by accident.
 */
export async function deliverEmail(notificationId: string, userId: string, titleKey: string, params: Record<string, string | number>, href: string) {
  const smtp = mailer();
  if (!smtp) {
    await db.notificationDelivery.create({ data: { notificationId, channel: "email", status: "skipped" } });
    return;
  }
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return;
  const notif = en.notif as Record<string, string>;
  const subject = fill(notif[titleKey.replace("notif.", "")] ?? "EntityGate reminder", params);
  const link = `${appUrl() ?? ""}${href}`;
  try {
    await smtp.sendMail({ from: process.env.MAIL_FROM ?? "EntityGate <no-reply@entitygate.local>", to: user.email, subject, text: `${subject}\n\n${link}` });
    await db.notificationDelivery.create({ data: { notificationId, channel: "email", status: "sent", sentAt: new Date() } });
  } catch (e) {
    await db.notificationDelivery.create({ data: { notificationId, channel: "email", status: "failed", error: e instanceof Error ? e.message.slice(0, 500) : "unknown" } });
  }
}

/** One daily summary per person who has something open. */
export async function sendDailyDigests() {
  const smtp = mailer();
  if (!smtp) return { sent: 0 };
  const groups = await db.notification.groupBy({ by: ["userId"], where: { status: { in: ["UNREAD", "READ"] } }, _count: true });
  let sent = 0;
  for (const g of groups) {
    const user = await db.user.findUnique({ where: { id: g.userId }, select: { email: true, status: true } });
    if (!user || user.status !== "ACTIVE") continue;
    await smtp
      .sendMail({
        from: process.env.MAIL_FROM ?? "EntityGate <no-reply@entitygate.local>",
        to: user.email,
        subject: `EntityGate: ${g._count} open reminders`,
        text: `You have ${g._count} open reminders.\n\n${appUrl() ?? ""}/notifications`,
      })
      .then(() => sent++)
      .catch(() => undefined);
  }
  return { sent };
}
