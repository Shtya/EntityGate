import { BarChart3, BellRing, Database, Building2, CalendarCheck, HandCoins, Landmark, ReceiptText, TrendingUp, Wallet, FolderKanban, IdCard, LayoutGrid, ListChecks, ShieldAlert, ScrollText, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import type { PermissionKey } from "@/server/rbac/catalog";

export interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  permission?: PermissionKey;
  /** Keyboard shortcut "G then <key>" */
  key?: string;
}

export interface NavSection {
  labelKey: string;
  items: NavItem[];
}

/** Only modules that exist are listed. Each milestone adds its own entries here. */
export const NAV: NavSection[] = [
  {
    labelKey: "nav.workspace",
    items: [
      { labelKey: "nav.overview", href: "/", icon: LayoutGrid, permission: "overview:read", key: "o" },
      { labelKey: "nav.clients", href: "/clients", icon: Building2, permission: "client:read", key: "c" },
      { labelKey: "nav.employees", href: "/employees", icon: IdCard, permission: "employee:read", key: "e" },
      { labelKey: "nav.tasks", href: "/tasks", icon: ListChecks, permission: "task:read", key: "t" },
      { labelKey: "nav.cases", href: "/cases", icon: FolderKanban, permission: "case:read", key: "s" },
      { labelKey: "nav.escalations", href: "/escalations", icon: ShieldAlert, permission: "escalation:read" },
    ],
  },
  {
    labelKey: "nav.money",
    items: [
      { labelKey: "nav.billing", href: "/billing", icon: ReceiptText, permission: "invoice:read", key: "b" },
      { labelKey: "nav.pnl", href: "/finance/pnl", icon: TrendingUp, permission: "finance:read", key: "p" },
      { labelKey: "nav.expenses", href: "/finance/expenses", icon: Wallet, permission: "expense:read" },
      { labelKey: "nav.payroll", href: "/finance/payroll", icon: HandCoins, permission: "payroll:read" },
      { labelKey: "nav.payables", href: "/finance/payables", icon: Landmark, permission: "payable:read" },
      { labelKey: "nav.periods", href: "/finance/periods", icon: CalendarCheck, permission: "period:close" },
    ],
  },
  {
    labelKey: "nav.system",
    items: [
      { labelKey: "nav.reports", href: "/reports", icon: BarChart3, permission: "report:read" },
      { labelKey: "nav.users", href: "/admin/users", icon: Users, permission: "user:read", key: "u" },
      { labelKey: "nav.roles", href: "/admin/roles", icon: ShieldCheck, permission: "role:read", key: "r" },
      { labelKey: "nav.masterData", href: "/admin/master-data", icon: Database, permission: "master_data:manage" },
      { labelKey: "nav.reminders", href: "/admin/reminders", icon: BellRing, permission: "reminder_rule:manage" },
      { labelKey: "nav.audit", href: "/admin/audit", icon: ScrollText, permission: "audit:read", key: "a" },
    ],
  },
];

export function visibleNav(permissions: ReadonlySet<string> | string[]): NavSection[] {
  const has = (p?: string) => !p || (Array.isArray(permissions) ? permissions.includes(p) : permissions.has(p));
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => has(i.permission)) })).filter((s) => s.items.length > 0);
}
