import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { api, BASE, session, uniq } from "./helpers";

const db = new PrismaClient();
afterAll(() => db.$disconnect());

async function newClient(cookie: string) {
  const { data } = await api(cookie, "/clients", "POST", { displayName: `E2E ${uniq()}`, legalName: "E2E" });
  return data.id as string;
}

describe.skipIf(!BASE)("M2: workforce", () => {
  it("runs the joiner workflow: no placement, no headcount (WF-02)", async () => {
    const hr = await session.hr();
    const head = await session.head();
    const clientId = await newClient(head);
    const made = await api(hr, "/employees", "POST", { nameEn: `E2E ${uniq()}`, classification: "SPONSORED" });
    expect(made.status).toBe(201);
    const id = made.data.id;
    expect((await api(hr, `/employees/${id}/activate`, "POST", {})).status).toBe(422);
    expect((await api(hr, `/employees/${id}/allocations`, "POST", { clientId, effectiveFrom: "2026-01-01" })).status).toBe(201);
    expect((await api(hr, `/employees/${id}/activate`, "POST", {})).status).toBe(200);
    const steps = await db.workflowStep.count({ where: { workflow: { employeeId: id, type: "JOINER" } } });
    expect(steps).toBeGreaterThan(0);
  });

  it("a transfer closes the old placement on the new start date", async () => {
    const hr = await session.hr();
    const head = await session.head();
    const [a, b] = [await newClient(head), await newClient(head)];
    const { data } = await api(hr, "/employees", "POST", { nameEn: `E2E ${uniq()}`, classification: "GOSI", clientId: a, effectiveFrom: "2026-01-01" });
    expect((await api(hr, `/employees/${data.id}/allocations`, "POST", { clientId: b, effectiveFrom: "2026-05-01" })).status).toBe(201);
    const rows = await db.allocation.findMany({ where: { employeeId: data.id }, orderBy: { effectiveFrom: "asc" } });
    expect(rows.map((r) => r.clientId)).toEqual([a, b]);
    expect(rows[0].effectiveTo!.toISOString().slice(0, 10)).toBe("2026-05-01");
    // Backdating over an existing placement is refused, not silently overlapped.
    expect((await api(hr, `/employees/${data.id}/allocations`, "POST", { clientId: a, effectiveFrom: "2026-03-01" })).status).toBe(422);
  });

  it("exit keeps the last working day billable", async () => {
    const hr = await session.hr();
    const head = await session.head();
    const clientId = await newClient(head);
    const { data } = await api(hr, "/employees", "POST", { nameEn: `E2E ${uniq()}`, classification: "SPONSORED", clientId, effectiveFrom: "2026-01-01" });
    await api(hr, `/employees/${data.id}/activate`, "POST", {});
    await api(hr, `/employees/${data.id}/exit`, "POST", {});
    expect((await api(hr, `/employees/${data.id}/exit/complete`, "POST", { lastWorkingDay: "2026-09-10" })).status).toBe(200);
    const allocation = await db.allocation.findFirstOrThrow({ where: { employeeId: data.id } });
    expect(allocation.effectiveTo!.toISOString().slice(0, 10)).toBe("2026-09-11");
    expect((await db.employee.findUniqueOrThrow({ where: { id: data.id } })).status).toBe("EXITED");
  });

  it("encrypts identity numbers at rest and shows them only to permitted roles", async () => {
    const hr = await session.hr();
    const head = await session.head();
    const clientId = await newClient(head);
    const iqama = "2345678901";
    const { data } = await api(hr, "/employees", "POST", { nameEn: `E2E ${uniq()}`, classification: "SPONSORED", iqamaNo: iqama, clientId, effectiveFrom: "2026-01-01" });

    const stored = await db.employee.findUniqueOrThrow({ where: { id: data.id } });
    expect(stored.iqamaNo).not.toContain(iqama);
    expect(stored.iqamaNo).toMatch(/^enc:v1:/);

    expect((await api(hr, `/employees/${data.id}`)).data.iqamaNo).toBe(iqama);
    const seenByHead = (await api(head, `/employees/${data.id}`)).data;
    expect(seenByHead.iqamaNo).toBe("••••8901");

    // Saving the masked value back must not destroy the real number.
    expect((await api(head, `/employees/${data.id}`, "PUT", { nameEn: "E2E renamed", classification: "SPONSORED", iqamaNo: "••••8901" })).status).toBe(200);
    expect((await api(hr, `/employees/${data.id}`)).data.iqamaNo).toBe(iqama);
  });

  it("hides pay from roles without compensation access", async () => {
    const hr = await session.hr();
    const head = await session.head();
    const clientId = await newClient(head);
    const { data } = await api(hr, "/employees", "POST", { nameEn: `E2E ${uniq()}`, classification: "SPONSORED", clientId, effectiveFrom: "2026-01-01" });
    expect((await api(hr, `/employees/${data.id}/compensation`, "POST", { effectiveFrom: "2026-01-01", basic: "5000.50" })).status).toBe(201);
    expect((await api(hr, `/employees/${data.id}`)).data.compensations).toHaveLength(1);
    expect((await api(head, `/employees/${data.id}`)).data.compensations).toHaveLength(0);
    expect((await api(head, `/employees/${data.id}/compensation`, "POST", { effectiveFrom: "2026-02-01", basic: "1" })).status).toBe(403);
  });

  it("an account manager can't see or place people outside their clients", async () => {
    const hr = await session.hr();
    const head = await session.head();
    const clientId = await newClient(head);
    const { data } = await api(hr, "/employees", "POST", { nameEn: `E2E ${uniq()}`, classification: "SPONSORED", clientId, effectiveFrom: "2026-01-01" });
    const am = await session.am2();
    expect((await api(am, `/employees/${data.id}`)).status).toBe(403);
    expect((await api(am, "/employees", "POST", { nameEn: "x", classification: "GOSI", clientId })).status).toBe(403);
  });

  it("imports Excel with row-level errors, dry run first (EMP-06, UAT-02)", async () => {
    const head = await session.head();
    const hr = await session.hr();
    const client = await db.client.findUniqueOrThrow({ where: { id: await newClient(head) } });
    const good = `E2E-${uniq()}`;
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Employees");
    sheet.addRow(["employee_no", "name_en", "name_ar", "nationality", "iqama_no", "passport_no", "job_title", "email", "phone", "classification", "sponsor", "client_code", "effective_from"]);
    sheet.addRow([good, "Good One", null, null, "1111122222", null, null, null, null, "SPONSORED", "EntityGate", client.code, new Date("2026-01-01T00:00:00Z")]);
    sheet.addRow([good, "Duplicate", null, null, null, null, null, null, null, "GOSI", null, null, null]);
    sheet.addRow([`E2E-${uniq()}`, "Bad Client", null, null, null, null, null, null, null, "NOPE", null, "NO-SUCH", "2026-01-01"]);
    const buffer = await wb.xlsx.writeBuffer();

    const form = new FormData();
    form.set("file", new File([buffer as BlobPart], "people.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const res = await fetch(`${BASE}/api/v1/imports/employees`, { method: "POST", headers: { Cookie: hr }, body: form });
    expect(res.status).toBe(201);
    const jobId = (await res.json()).data.id;

    const job = (await api(hr, `/imports/${jobId}`)).data;
    expect([job.totalRows, job.okRows, job.errorRows]).toEqual([3, 1, 2]);
    expect(job.rows[1].errors[0].path).toBe("employee_no");
    expect(job.rows[2].errors.map((e: { path: string }) => e.path).sort()).toEqual(["classification", "client_code"]);
    expect(await db.employee.count({ where: { employeeNo: good } })).toBe(0); // dry run wrote nothing

    const commit = await api(hr, `/imports/${jobId}/commit`, "POST", {});
    expect(commit.data).toEqual({ created: 1, updated: 0 });
    expect((await api(hr, `/imports/${jobId}/commit`, "POST", {})).status).toBe(422); // can't run twice

    const employee = await db.employee.findUniqueOrThrow({ where: { employeeNo: good }, include: { allocations: true } });
    expect(employee.iqamaNo).toMatch(/^enc:v1:/);
    expect(employee.allocations[0].clientId).toBe(client.id);
  });
});
