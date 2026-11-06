import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { getClientScope } from "@/server/rbac/actor";
import { can, type Actor } from "@/server/rbac/policy";
import { period } from "@/server/validation";
import { workforceSummary } from "@/server/modules/employees/service";
import { receivables } from "@/server/modules/billing/service";
import { pnl, recentPeriods } from "@/server/modules/finance/service";
import { periodBounds, periodOf, todayDate } from "@/lib/dates";

export const dashboardQuery = z.object({
  period: period.optional().catch(undefined),
  client: z.string().max(50).optional(),
  manager: z.string().max(50).optional(),
  region: z.string().max(50).optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuery>;

const activeNow = (day: Date) => ({ effectiveFrom: { lte: day }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: day } }] });

/** Turns the filter bar into client ids. Every widget then applies the viewer's own scope on top. */
async function filteredClientIds(q: DashboardQuery, day: Date): Promise<string[] | undefined> {
  if (!q.client && !q.manager && !q.region) return undefined;
  const rows = await db.client.findMany({
    where: {
      ...(q.client ? { id: q.client } : {}),
      ...(q.manager ? { assignments: { some: { userId: q.manager, role: "OWNER", ...activeNow(day) } } } : {}),
      ...(q.region ? { allocations: { some: { ...activeNow(day), location: { regionId: q.region } } } } : {}),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Open work the viewer may see: their clients, plus anything they personally own. */
async function workFilter(actor: Actor, ids: string[] | undefined) {
  const scope = await getClientScope();
  if (scope.kind === "all") return ids ? { clientId: { in: ids } } : {};
  const mine = ids ? scope.clientIds.filter((c) => ids.includes(c)) : scope.clientIds;
  return ids ? { clientId: { in: mine } } : { OR: [{ ownerId: actor.id }, { clientId: { in: mine } }] };
}

/** One source for the Overview. Each block is null when the viewer lacks its permission. */
export async function dashboardData(actor: Actor, q: DashboardQuery) {
  const today = todayDate();
  const month = q.period ?? periodOf(today);
  const lastDay = new Date(periodBounds(month).end.getTime() - 86_400_000);
  const day = lastDay < today ? lastDay : today;
  const ids = await filteredClientIds(q, day);
  const work = await workFilter(actor, ids);
  const scope = await getClientScope();

  const trendMonths = recentPeriods(12, periodBounds(month).start);
  const yearStart = `${month.slice(0, 4)}-01`;
  const [trend, year, headcount, money, escalations, overdueTasks, breachedCases, openCases, myTasks, attention] = await Promise.all([
    can(actor, "finance:read") ? pnl(trendMonths[11], month, ids) : null,
    can(actor, "finance:read") ? pnl(yearStart, month, ids) : null,
    can(actor, "employee:read") ? workforceSummary({ clientIds: ids, day }) : null,
    can(actor, "invoice:read") ? receivables(ids) : null,
    can(actor, "escalation:read") ? db.escalation.count({ where: { ...work, status: { not: "RESOLVED" } } }) : null,
    can(actor, "task:read") ? db.task.count({ where: { ...work, archivedAt: null, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, dueAt: { lt: new Date() } } }) : null,
    can(actor, "case:read") ? db.case.count({ where: { ...work, closedAt: null, resolvedAt: null, slaDueAt: { lt: new Date() } } }) : null,
    can(actor, "case:read") ? db.case.count({ where: { ...work, closedAt: null, resolvedAt: null } }) : null,
    can(actor, "task:read")
      ? db.task.findMany({
          where: { ownerId: actor.id, archivedAt: null, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, dueAt: { lt: new Date(today.getTime() + 86_400_000) } },
          orderBy: { dueAt: "asc" },
          take: 5,
          select: { id: true, number: true, title: true, dueAt: true, priority: true },
        })
      : null,
    can(actor, "client:read")
      ? db.client.findMany({
          where: {
            archivedAt: null,
            health: { in: ["AT_RISK", "WATCH"] },
            ...(scope.kind === "all" ? {} : { id: { in: scope.clientIds } }),
            ...(ids ? { AND: [{ id: { in: ids } }] } : {}),
          },
          orderBy: [{ health: "asc" }, { displayName: "asc" }],
          take: 6,
          select: { id: true, displayName: true, health: true },
        })
      : null,
  ]);
  const current = trend?.months.find((m) => m.id === month)?.pnl ?? null;
  return { month, filtered: Boolean(ids), companyView: Boolean(trend?.companyView), current, year: year?.company ?? null, trend: trend?.months ?? null, headcount, money, escalations, overdueTasks, breachedCases, openCases, myTasks, attention };
}
