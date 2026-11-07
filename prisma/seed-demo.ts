/**
 * Demo data for walkthroughs. It drives the real API, so every record passes the same rules,
 * calculations and audit as a person's work. Needs the app running with AUTH_MFA_ENFORCED=false.
 *
 *   npm run seed:demo                    (against http://localhost:3000)
 *   DEMO_BASE_URL=http://host npm run seed:demo
 *
 * Client codes aren't chosen here, so a marker expense stops a second run from doubling everything.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV === "production") throw new Error("Demo data must not be loaded in production.");
if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("connection_limit")) {
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("connection_limit", "2");
  process.env.DATABASE_URL = url.toString();
}

const BASE = process.env.DEMO_BASE_URL || "http://localhost:3000";
const db = new PrismaClient();
const MARKER = "Demo data marker";

async function signIn(email: string) {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ email, password: process.env.SEED_USER_PASSWORD }) });
  if (!res.ok) throw new Error(`Sign-in failed for ${email}: ${res.status}. Is the app running with the seeded users?`);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

async function call(cookie: string, path: string, json: unknown = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: BASE }, body: JSON.stringify(json) });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(body?.error ?? body)}`);
  return body?.data ?? body;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const now = new Date();
const monthsAgo = (n: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1));
const period = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const addDays = (days: number) => iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)));

const CLIENTS = [
  { name: "Najd Logistics", model: "COST_PLUS_PERCENT", fee: { feePercent: "8" }, owner: "am1", people: 9 },
  { name: "Red Sea Hospitality", model: "COST_PLUS_PERCENT", fee: { feePercent: "10" }, owner: "am1", people: 7 },
  { name: "Tuwaiq Software", model: "FIXED_PER_HEAD", fee: { feePerHead: "900" }, owner: "am2", people: 6 },
  { name: "Asir Foods", model: "COST_PLUS_FIXED", fee: { feeFixedMonthly: "4500" }, owner: "am2", people: 5 },
  { name: "Gulf Medical Supplies", model: "COST_PLUS_PERCENT", fee: { feePercent: "8" }, owner: "am1", people: 4 },
] as const;
const FIRST = ["Omar", "Sara", "Khalid", "Lina", "Yousef", "Maha", "Faisal", "Noura", "Hassan", "Dana", "Tariq", "Reem"];
const LAST = ["Al-Harbi", "Mansour", "Qureshi", "Haddad", "Nasser", "Saleh", "Rahman", "Fahad", "Aziz", "Karim"];
const TITLES = ["Operations Coordinator", "Software Engineer", "Sales Representative", "Accountant", "Warehouse Supervisor", "Customer Support Agent"];
const CLASSES = ["SPONSORED", "SPONSORED", "SPONSORED", "NON_SPONSORED", "GOSI"];

async function main() {
  if (await db.expense.findFirst({ where: { vendor: MARKER } })) {
    console.log("Demo data is already loaded.");
    return;
  }
  console.log(`Loading demo data through ${BASE}…`);
  const [head, hr, finance] = await Promise.all([signIn("head@entitygate.test"), signIn("hr@entitygate.test"), signIn("finance@entitygate.test")]);
  const users = new Map((await db.user.findMany({ where: { email: { endsWith: "@entitygate.test" } } })).map((u) => [u.email.split("@")[0], u.id]));
  const start = iso(monthsAgo(6));
  const sponsors = await db.sponsor.findMany({ select: { id: true } });
  const categories = new Map((await db.expenseCategory.findMany()).map((c) => [c.code, c.id]));
  const caseCategories = await db.caseCategory.findMany({ take: 6 });

  const clients: { id: string; name: string; owner: string; employees: string[] }[] = [];
  let seq = 0;
  for (const c of CLIENTS) {
    const { id } = await call(head, "/clients", { displayName: c.name, legalName: `${c.name} Co. Ltd.`, country: "Saudi Arabia" });
    await call(head, `/clients/${id}/assignments`, { userId: users.get(c.owner), role: "OWNER", effectiveFrom: start });
    await call(head, `/clients/${id}/status`, { status: "ONBOARDING" });
    await call(finance, `/clients/${id}/contracts`, { number: `CT-${now.getUTCFullYear()}-${pad(clients.length + 1)}`, startDate: start, endDate: addDays(20 + clients.length * 40), billingModel: c.model, paymentTermsDays: 30, renewalNoticeDays: 60, vatPercent: "15", sponsorshipRenewalFee: "1500", ...c.fee });
    await call(head, `/clients/${id}/status`, { status: "ACTIVE" });
    const employees: string[] = [];
    for (let i = 0; i < c.people; i++, seq++) {
      const name = `${FIRST[seq % FIRST.length]} ${LAST[(seq * 3) % LAST.length]}`;
      const classification = CLASSES[seq % CLASSES.length];
      const person = await call(hr, "/employees", { nameEn: name, classification, jobTitle: TITLES[seq % TITLES.length], clientId: id, effectiveFrom: start, ...(classification === "SPONSORED" && sponsors.length ? { sponsorId: sponsors[seq % sponsors.length].id } : {}) });
      const basic = 6000 + ((seq * 730) % 9000);
      await call(hr, `/employees/${person.id}/compensation`, { effectiveFrom: start, basic: String(basic), housing: String(Math.round(basic * 0.25)), transport: "500", gosiEmployer: String(Math.round(basic * 0.1175)), insuranceMonthly: "350" });
      // A spread of expiries, so reminders and the expiring-documents report have something to show.
      await call(hr, "/documents", { ownerType: "EMPLOYEE", ownerId: person.id, type: "IQAMA", issueDate: start, expiryDate: addDays(-10 + seq * 17) });
      employees.push(person.id);
    }
    clients.push({ id, name: c.name, owner: c.owner, employees });
    console.log(`  ${c.name}: ${employees.length} people`);
  }

  // Three finished months: costs, billing and payroll, in the order Finance works.
  const invoicesByMonth: string[][] = [];
  for (const back of [3, 2, 1]) {
    const month = monthsAgo(back);
    const day = (d: number) => `${period(month)}-${pad(d)}`;
    for (const [i, client] of clients.entries()) {
      const fee = await call(finance, "/expenses", { categoryId: categories.get("VISA_FEES"), clientId: client.id, description: "Exit / re-entry visas", amount: String(400 + i * 150), incurredAt: day(8 + i), vendor: "Muqeem", recoverable: true });
      await call(finance, `/expenses/${fee.id}/decision`, { approved: true });
      const direct = await call(finance, "/expenses", { categoryId: categories.get("DIRECT_OTHER"), clientId: client.id, description: "Courier and attestation", amount: String(150 + i * 40), incurredAt: day(12), recoverable: false });
      await call(finance, `/expenses/${direct.id}/decision`, { approved: true });
    }
    const overhead = await call(finance, "/expenses", { categoryId: categories.get("OFFICE_RENT"), description: "Office rent", amount: "18000", incurredAt: day(1), vendor: "Olaya Towers" });
    await call(finance, `/expenses/${overhead.id}/decision`, { approved: true });
    const platforms = await call(finance, "/expenses", { categoryId: categories.get("DIGITAL_PLATFORMS"), description: "Platform subscriptions", amount: "2400", incurredAt: day(3), vendor: back === 3 ? MARKER : "Qiwa" });
    await call(finance, `/expenses/${platforms.id}/decision`, { approved: true });

    const payroll = await call(finance, "/payroll/generate", { period: period(month) });
    await call(finance, `/payroll/${payroll.id}/confirm`, { approved: true });
    const run = await call(finance, "/billing/runs", { period: period(month) });
    await call(finance, `/billing/runs/${run.id}/approve`);
    await call(finance, `/billing/runs/${run.id}/issue`);
    const rows = await db.invoice.findMany({ where: { billingRunId: run.id, clientId: { in: clients.map((c) => c.id) } }, select: { id: true, total: true, clientId: true } });
    invoicesByMonth.push(rows.map((r) => r.id));

    // Dates a real month would have had, so aging looks like a working business.
    const issued = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    await db.invoice.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { issueDate: issued, dueDate: new Date(issued.getTime() + 30 * 86_400_000) } });

    // The oldest month is mostly collected, the next partly, the latest not at all.
    for (const [i, row] of rows.entries()) {
      const share = back === 3 ? (i === rows.length - 1 ? 0 : 1) : back === 2 ? (i % 2 ? 0.5 : 0) : 0;
      if (!share) continue;
      const amount = (Number(row.total) * share).toFixed(2);
      await call(finance, "/payments", { clientId: row.clientId, invoiceId: row.id, amount, receivedAt: iso(new Date(issued.getTime() + 20 * 86_400_000)), method: "bank_transfer", reference: `TRX${period(month).replace("-", "")}${pad(i + 1)}` });
    }
    console.log(`  ${period(month)}: billed ${rows.length} clients`);
  }
  await call(finance, "/periods/close", { period: period(monthsAgo(3)) });

  // Live work for today.
  const owners = ["am1", "am2", "ops"].map((u) => users.get(u)!);
  for (const [i, category] of caseCategories.entries()) {
    const client = clients[i % clients.length];
    await call(head, "/cases", { title: `${category.name}: ${client.name}`, categoryId: category.id, clientId: client.id, employeeId: client.employees[0], ownerId: owners[i % owners.length] });
  }
  const tasks: [string, number, string][] = [["Send renewal quote", -2, "HIGH"], ["Chase overdue invoice", 0, "HIGH"], ["Collect signed contract", 1, "MEDIUM"], ["Review iqama renewals", 3, "MEDIUM"], ["Prepare monthly client update", 6, "LOW"]];
  for (const [i, [title, due, priority]] of tasks.entries()) {
    await call(head, "/tasks", { title, ownerId: owners[i % 2], clientId: clients[i % 2 === 0 ? 0 : 2].id, dueAt: addDays(due), priority });
  }
  await call(head, "/escalations", { title: "Iqama renewals blocked at Muqeem", severity: "HIGH", ownerId: users.get("ops"), clientId: clients[1].id, impactAmount: "42000.00" });
  await call(head, "/escalations", { title: "Disputed fee on last invoice", severity: "CRITICAL", ownerId: users.get("head"), clientId: clients[3].id, impactAmount: "108226.00" });

  for (const [type, description, due, amount] of [["SALARY", "Salaries for this month", 2, "198000"], ["GOSI", "GOSI contributions", 10, "21400"], ["GOV_FEE", "Work permit renewals", -3, "8600"]] as const) {
    await call(finance, "/payables", { type, description, dueDate: addDays(due), amount });
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
