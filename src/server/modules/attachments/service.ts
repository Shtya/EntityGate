import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { forbidden, invalid, notFound } from "@/server/errors";
import { getClientScope } from "@/server/rbac/actor";
import { can, canAny, inScope, type Actor } from "@/server/rbac/policy";
import type { PermissionKey } from "@/server/rbac/catalog";
import { storage } from "./storage";
import { scanBuffer } from "./scan";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** Magic-number check so a renamed executable can't pass as a PDF. */
function sniff(buf: Buffer, mime: string): boolean {
  const hex = buf.subarray(0, 8).toString("hex");
  switch (mime) {
    case "application/pdf":
      return buf.subarray(0, 5).toString() === "%PDF-";
    case "image/png":
      return hex.startsWith("89504e470d0a1a0a");
    case "image/jpeg":
      return hex.startsWith("ffd8ff");
    case "image/webp":
      return buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
    case "text/csv":
      return !buf.subarray(0, 1024).includes(0);
    default: // OOXML containers are zip files
      return hex.startsWith("504b0304");
  }
}

/** Read-only roles (Executive, Auditor) must not be able to add files to the system. */
const UPLOAD_PERMISSIONS: PermissionKey[] = ["document:manage", "task:update", "case:update", "expense:create", "employee:import", "payment:record"];

export async function saveAttachment(actor: Actor, file: File) {
  if (!canAny(actor, UPLOAD_PERMISSIONS)) throw forbidden();
  if (file.size === 0) throw invalid("errors.fileEmpty");
  if (file.size > MAX_UPLOAD_BYTES) throw invalid("errors.fileTooLarge");
  const ext = ALLOWED_MIME[file.type];
  if (!ext) throw invalid("errors.fileType");

  const data = Buffer.from(await file.arrayBuffer());
  if (!sniff(data, file.type)) throw invalid("errors.fileMismatch");

  const scan = await scanBuffer(data);
  if (scan === "INFECTED") {
    await writeAudit(db, {
      actorId: actor.id,
      entityType: "attachment",
      entityId: "-",
      action: "upload_blocked",
      after: { filename: file.name, reason: "malware" },
    });
    throw invalid("errors.fileInfected");
  }

  const sha256 = createHash("sha256").update(data).digest("hex");
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
  await storage.put(key, data, file.type);

  const filename = file.name.replace(/[^\w.\- ()؀-ۿ]/g, "_").slice(0, 200) || `file.${ext}`;
  const attachment = await db.attachment.create({
    data: {
      storageKey: key,
      filename,
      mime: file.type,
      size: file.size,
      sha256,
      scanStatus: scan,
      uploadedById: actor.id,
    },
    select: { id: true, filename: true, mime: true, size: true, scanStatus: true, createdAt: true },
  });
  await writeAudit(db, {
    actorId: actor.id,
    entityType: "attachment",
    entityId: attachment.id,
    action: "upload",
    after: { filename, size: file.size, mime: file.type },
  });
  return attachment;
}

/**
 * A file is as private as the record it's attached to. The uploader can always get it back; anyone
 * else needs that record's read permission and the client in their scope. A file not attached to
 * anything is open only to people who see every client.
 */
async function mayRead(actor: Actor, attachmentId: string, uploadedById: string) {
  if (uploadedById === actor.id) return true;
  const scope = await getClientScope();
  const [documents, expense, payment, taskComment, caseComment, importJob] = await Promise.all([
    db.document.findMany({ where: { attachmentId }, select: { ownerType: true, ownerId: true } }),
    db.expense.findFirst({ where: { attachmentId }, select: { clientId: true } }),
    db.payment.findFirst({ where: { proofAttachmentId: attachmentId }, select: { clientId: true } }),
    db.taskComment.findFirst({ where: { attachmentId }, select: { task: { select: { clientId: true, ownerId: true } } } }),
    db.caseComment.findFirst({ where: { attachmentId }, select: { case: { select: { clientId: true, ownerId: true } } } }),
    db.importJob.findFirst({ where: { fileAttachmentId: attachmentId }, select: { id: true } }),
  ]);
  const linked = documents.length > 0 || expense || payment || taskComment || caseComment || importJob;
  if (!linked) return scope.kind === "all" && can(actor, "document:read");
  if (expense && can(actor, "expense:read") && inScope(scope, expense.clientId)) return true;
  if (payment && can(actor, "payment:read") && inScope(scope, payment.clientId)) return true;
  if (taskComment && can(actor, "task:read") && (taskComment.task.ownerId === actor.id || inScope(scope, taskComment.task.clientId))) return true;
  if (caseComment && can(actor, "case:read") && (caseComment.case.ownerId === actor.id || inScope(scope, caseComment.case.clientId))) return true;
  if (importJob && can(actor, "employee:import")) return true;
  if (!documents.length || !can(actor, "document:read")) return false;
  if (scope.kind === "all") return true;
  for (const d of documents) {
    if (d.ownerType === "CLIENT" && scope.clientIds.includes(d.ownerId)) return true;
    if (d.ownerType === "CONTRACT" && (await db.contract.count({ where: { id: d.ownerId, clientId: { in: scope.clientIds } } }))) return true;
    if (d.ownerType === "EMPLOYEE" && (await db.allocation.count({ where: { employeeId: d.ownerId, clientId: { in: scope.clientIds } } }))) return true;
  }
  return false;
}

export async function readAttachment(actor: Actor, id: string) {
  const a = await db.attachment.findUnique({ where: { id } });
  if (!a) throw notFound("errors.fileNotFound");
  if (!(await mayRead(actor, id, a.uploadedById))) throw forbidden();
  if (a.scanStatus === "INFECTED") throw forbidden("errors.fileQuarantined");
  const data = await storage.get(a.storageKey);
  return { meta: a, data };
}
