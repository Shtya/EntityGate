/**
 * Seed: RBAC catalog + reference data + one demo user per role.
 * Idempotent — safe to run repeatedly. Business records (clients, employees, ...)
 * are seeded by later milestones as their modules land.
 *
 * Demo users share the password in SEED_USER_PASSWORD (.env, never committed).
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword, isArgon2Hash } from "../src/lib/password";
import { PERMISSIONS, ROLES, type RoleKey } from "../src/server/rbac/catalog";

const db = new PrismaClient();

/**
 * Catalog defaults only apply to things that are new. Permissions an admin has already
 * configured in the UI are never overwritten by re-running the seed.
 */
async function syncRbac() {
  const known = new Set((await db.permission.findMany({ select: { key: true } })).map((p) => p.key));
  const added = Object.keys(PERMISSIONS).filter((key) => !known.has(key));
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({ where: { key }, update: { description }, create: { key, description } });
  }
  const perms = new Map((await db.permission.findMany()).map((p) => [p.key, p.id]));

  for (const [key, role] of Object.entries(ROLES)) {
    const existing = await db.role.findUnique({ where: { key } });
    const r = await db.role.upsert({
      where: { key },
      update: { name: role.name, description: role.description, requiresMfa: role.requiresMfa },
      create: { key, name: role.name, description: role.description, requiresMfa: role.requiresMfa },
    });
    const defaults = existing ? role.permissions.filter((p) => added.includes(p)) : role.permissions;
    await db.rolePermission.createMany({
      data: defaults.map((p) => ({ roleId: r.id, permissionId: perms.get(p)! })),
      skipDuplicates: true,
    });
  }
  console.log(`  rbac: ${perms.size} permissions, ${Object.keys(ROLES).length} roles, ${added.length} new permissions`);
}

async function seedReferenceData() {
  const regions = [
    { code: "CENTRAL", name: "Central", locations: [{ name: "Riyadh HQ", city: "Riyadh" }] },
    { code: "WEST", name: "West", locations: [{ name: "Jeddah", city: "Jeddah" }, { name: "Makkah", city: "Makkah" }] },
    { code: "EAST", name: "East", locations: [{ name: "Dammam", city: "Dammam" }, { name: "Al Khobar", city: "Al Khobar" }] },
  ];
  for (const r of regions) {
    const region = await db.region.upsert({ where: { code: r.code }, update: { name: r.name }, create: { code: r.code, name: r.name } });
    for (const l of r.locations) {
      await db.location.upsert({
        where: { regionId_name: { regionId: region.id, name: l.name } },
        update: { city: l.city },
        create: { name: l.name, city: l.city, regionId: region.id },
      });
    }
  }

  const caseCategories: { code: string; name: string; sev: "HIGH" | "MEDIUM" | "LOW"; sla: number; fr: number }[] = [
    { code: "EXIT_REENTRY", name: "Exit / re-entry visa", sev: "MEDIUM", sla: 48, fr: 4 },
    { code: "IQAMA_ISSUANCE", name: "Iqama issuance", sev: "HIGH", sla: 120, fr: 8 },
    { code: "IQAMA_RENEWAL", name: "Iqama renewal", sev: "HIGH", sla: 72, fr: 8 },
    { code: "DEPENDENT_IQAMA", name: "Dependent iqama issuance", sev: "MEDIUM", sla: 120, fr: 8 },
    { code: "WORK_PERMIT", name: "Work permit", sev: "HIGH", sla: 72, fr: 8 },
    { code: "CONTRACT_ISSUANCE", name: "Employment contract issuance", sev: "MEDIUM", sla: 48, fr: 8 },
    { code: "SPONSOR_TRANSFER", name: "Sponsorship transfer", sev: "HIGH", sla: 240, fr: 8 },
    { code: "ONBOARDING", name: "New joiner onboarding", sev: "MEDIUM", sla: 240, fr: 8 },
    { code: "FINAL_SETTLEMENT", name: "Final settlement", sev: "HIGH", sla: 120, fr: 8 },
    { code: "PAYROLL_PROCESSING", name: "Payroll processing", sev: "HIGH", sla: 48, fr: 4 },
    { code: "GENERAL", name: "General request", sev: "LOW", sla: 72, fr: 24 },
  ];
  for (const c of caseCategories) {
    const data = { name: c.name, defaultSeverity: c.sev, slaHours: c.sla, firstResponseHours: c.fr };
    await db.caseCategory.upsert({ where: { code: c.code }, update: data, create: { code: c.code, ...data } });
  }

  const expenseCategories: { code: string; name: string; kind: "DIRECT" | "OVERHEAD"; rec: boolean }[] = [
    { code: "VISA_FEES", name: "Visa fees", kind: "DIRECT", rec: true },
    { code: "EXIT_REENTRY_FEES", name: "Exit / re-entry fees", kind: "DIRECT", rec: true },
    { code: "IQAMA_FEES", name: "Iqama fees", kind: "DIRECT", rec: true },
    { code: "WORK_PERMIT_FEES", name: "Work permit fees", kind: "DIRECT", rec: true },
    { code: "MEDICAL_INSURANCE", name: "Medical insurance", kind: "DIRECT", rec: true },
    { code: "GOSI", name: "GOSI contributions", kind: "DIRECT", rec: false },
    { code: "TRAVEL", name: "Employee travel", kind: "DIRECT", rec: true },
    { code: "DIRECT_OTHER", name: "Other direct cost", kind: "DIRECT", rec: false },
    { code: "DIGITAL_PLATFORMS", name: "Digital platforms & subscriptions", kind: "OVERHEAD", rec: false },
    { code: "OFFICE_RENT", name: "Office rent", kind: "OVERHEAD", rec: false },
    { code: "PROFESSIONAL_FEES", name: "Professional fees", kind: "OVERHEAD", rec: false },
    { code: "STAFF_COSTS", name: "Internal staff costs", kind: "OVERHEAD", rec: false },
    { code: "OVERHEAD_OTHER", name: "Other overhead", kind: "OVERHEAD", rec: false },
  ];
  for (const e of expenseCategories) {
    const data = { name: e.name, kind: e.kind, recoverableDefault: e.rec };
    await db.expenseCategory.upsert({ where: { code: e.code }, update: data, create: { code: e.code, ...data } });
  }

  await db.sponsor.upsert({
    where: { name: "EntityGate" },
    update: {},
    create: { name: "EntityGate", type: "OWN" },
  });

  // Escalation SLA from the prototype: critical = 4h, high = 1 business day.
  const sla: { severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; h: number; bh: boolean; d: string }[] = [
    { severity: "CRITICAL", h: 4, bh: false, d: "Assigned action and management update within 4 hours" },
    { severity: "HIGH", h: 8, bh: true, d: "Update within one business day" },
    { severity: "MEDIUM", h: 24, bh: true, d: "Update within three business days" },
    { severity: "LOW", h: 40, bh: true, d: "Update within one business week" },
  ];
  for (const s of sla) {
    await db.slaPolicy.upsert({
      where: { scope_severity: { scope: "escalation", severity: s.severity } },
      update: { updateWithinHours: s.h, businessHoursOnly: s.bh, description: s.d },
      create: { scope: "escalation", severity: s.severity, updateWithinHours: s.h, businessHoursOnly: s.bh, description: s.d },
    });
  }

  // Default reminder rules (engine ships in M3; rules are editable by admins).
  const rules: { name: string; trigger: "INVOICE_DUE" | "DOC_EXPIRY" | "CONTRACT_RENEWAL" | "TASK_OVERDUE" | "CASE_SLA" | "PAYABLE_DUE" | "ESCALATION_UPDATE"; offsets: number[]; recipients: string[]; esc: number | null }[] = [
    { name: "Client invoice due / overdue", trigger: "INVOICE_DUE", offsets: [-7, -3, 0, 1, 7, 30], recipients: ["owner", "role:FINANCE"], esc: 48 },
    { name: "Employee document expiry", trigger: "DOC_EXPIRY", offsets: [-90, -60, -30, -7, 0], recipients: ["owner", "role:HR"], esc: 72 },
    { name: "Client contract renewal", trigger: "CONTRACT_RENEWAL", offsets: [-90, -60, -30], recipients: ["owner", "role:DEPT_HEAD"], esc: null },
    { name: "Task overdue", trigger: "TASK_OVERDUE", offsets: [0, 1, 3], recipients: ["owner", "manager"], esc: 24 },
    { name: "Case SLA breach", trigger: "CASE_SLA", offsets: [0], recipients: ["owner", "manager"], esc: 4 },
    { name: "Escalation update overdue", trigger: "ESCALATION_UPDATE", offsets: [0, 1, 3], recipients: ["owner", "manager"], esc: null },
    { name: "Payables due (salaries, GOSI, fees)", trigger: "PAYABLE_DUE", offsets: [-5, -2, 0], recipients: ["role:FINANCE"], esc: 24 },
  ];
  for (const r of rules) {
    const existing = await db.reminderRule.findFirst({ where: { trigger: r.trigger, name: r.name } });
    if (!existing) {
      await db.reminderRule.create({
        data: { name: r.name, trigger: r.trigger, offsetsDays: r.offsets, channels: ["in_app", "email"], recipients: r.recipients, escalateAfterHours: r.esc },
      });
    }
  }
  console.log("  reference data: regions, locations, case/expense categories, sponsor, SLA, reminder rules");
}

const DEMO_USERS: { email: string; name: string; title: string; role: RoleKey }[] = [
  { email: "admin@entitygate.test", name: "Sara Al-Qahtani", title: "System Administrator", role: "ADMIN" },
  { email: "head@entitygate.test", name: "Mohammed Al-Ahmadi", title: "Head of Resources Management", role: "DEPT_HEAD" },
  { email: "am1@entitygate.test", name: "Abdullah Othman", title: "Account Manager", role: "ACCOUNT_MANAGER" },
  { email: "am2@entitygate.test", name: "Ameen Abbas", title: "Account Manager", role: "ACCOUNT_MANAGER" },
  { email: "hr@entitygate.test", name: "Noura Al-Harbi", title: "HR Operations Lead", role: "HR" },
  { email: "finance@entitygate.test", name: "Khalid Al-Mutairi", title: "Finance Manager", role: "FINANCE" },
  { email: "ops@entitygate.test", name: "Abdulaziz Khan", title: "Operations Supervisor", role: "OPS_SUPERVISOR" },
  { email: "exec@entitygate.test", name: "Faisal Al-Saud", title: "General Manager", role: "EXECUTIVE" },
  { email: "auditor@entitygate.test", name: "Huda Al-Shehri", title: "Compliance Officer", role: "AUDITOR" },
];

async function seedUsers() {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error("Set SEED_USER_PASSWORD (min 10 chars) in .env before seeding users");
  }
  const hash = await hashPassword(password);
  for (const u of DEMO_USERS) {
    const role = await db.role.findUniqueOrThrow({ where: { key: u.role } });
    const user = await db.user.upsert({
      where: { email: u.email },
      update: { name: u.name, title: u.title },
      create: { email: u.email, name: u.name, title: u.title, emailVerified: true },
    });
    await db.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
    const acc = await db.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
    if (!acc) {
      await db.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash } });
    } else if (!isArgon2Hash(acc.password)) {
      await db.account.update({ where: { id: acc.id }, data: { password: hash } }); // migrate older demo hashes
    }
  }
  const team = await db.team.upsert({ where: { name: "Resources Management" }, update: {}, create: { name: "Resources Management" } });
  for (const email of ["head@entitygate.test", "am1@entitygate.test", "am2@entitygate.test", "ops@entitygate.test"]) {
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    await db.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: user.id } },
      update: {},
      create: { teamId: team.id, userId: user.id, isLead: email.startsWith("head") },
    });
  }
  console.log(`  users: ${DEMO_USERS.length} demo users (password = SEED_USER_PASSWORD)`);
}

/** Development admin, loaded from env. Its password is short on purpose, so it never ships. */
async function seedDevAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return;
  const role = await db.role.findUniqueOrThrow({ where: { key: "ADMIN" } });
  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "System Admin", title: "System Administrator", emailVerified: true },
  });
  await db.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
  const hash = await hashPassword(password);
  const acc = await db.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  if (acc) await db.account.update({ where: { id: acc.id }, data: { password: hash } });
  else await db.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash } });
  console.log(`  dev admin: ${email}`);
}

/** The first real administrator: a random password, shown once, which must be changed at sign-in. */
async function bootstrapAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!email) throw new Error("Set BOOTSTRAP_ADMIN_EMAIL to the first administrator's address.");
  const role = await db.role.findUniqueOrThrow({ where: { key: "ADMIN" } });
  if (await db.user.findUnique({ where: { email } })) {
    console.log(`  ${email} already exists; left unchanged.`);
    return;
  }
  const password = randomBytes(18).toString("base64url");
  const user = await db.user.create({ data: { email, name: "Administrator", emailVerified: true, mustChangePassword: true } });
  await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  await db.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: await hashPassword(password) } });
  console.log(`  admin: ${email}\n  one-time password: ${password}`);
}

async function main() {
  // --bootstrap is the production path. It creates no demo users or known passwords.
  const bootstrap = process.argv.includes("--bootstrap");
  if (process.env.NODE_ENV === "production" && !bootstrap) {
    throw new Error("The seed creates known-password accounts and must not run in production. Use npm run db:bootstrap.");
  }
  console.log(bootstrap ? "Bootstrapping EntityGate…" : "Seeding EntityGate…");
  await syncRbac();
  await seedReferenceData();
  if (bootstrap) {
    await bootstrapAdmin();
  } else {
    await seedUsers();
    await seedDevAdmin();
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
