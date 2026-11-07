/**
 * Permission catalog and default role matrix (SRS §3, IAM-02).
 * This file is the single source of truth: the seed syncs it into the DB,
 * and the DB is what's enforced at runtime (so admins can adjust later).
 *
 * NOTE: no "server-only" import here — the seed script and tests import it.
 */

export const PERMISSIONS = {
  // Pages
  "overview:read": "Open the Overview page",
  // Clients & contracts
  "client:read": "View clients in your scope",
  "client:read_all": "View all clients regardless of assignment (scope: all)",
  "client:create": "Create clients",
  "client:update": "Edit client profiles",
  "client:archive": "Archive / change client lifecycle",
  "client:assign": "Assign account owners and support team",
  "contract:read": "View contracts and rate cards",
  "contract:manage": "Create and edit contracts and rate cards",
  // Workforce
  "employee:read": "View employees in your scope",
  "employee:create": "Create employees",
  "employee:update": "Edit employees",
  "employee:archive": "Archive employees",
  "employee:import": "Import employees from Excel",
  "employee:read_sensitive": "View identity numbers (iqama, passport)",
  "compensation:read": "View salaries and cost basis",
  "compensation:manage": "Edit salaries and cost basis",
  "allocation:manage": "Allocate employees to clients",
  "document:read": "View documents",
  "document:manage": "Upload and edit documents",
  // Operations
  "task:read": "View tasks",
  "task:read_all": "View team and department task queues",
  "task:create": "Create tasks",
  "task:update": "Update tasks",
  "task_category:manage": "Add, rename and remove task categories",
  "case:read": "View cases",
  "case:create": "Create cases",
  "case:update": "Update case stages",
  "case:close": "Close cases",
  "case:reopen": "Reopen closed cases",
  "escalation:read": "View escalations",
  "escalation:raise": "Raise escalations",
  "escalation:manage": "Own, update and resolve escalations",
  // Billing & finance
  "invoice:read": "View invoices",
  "invoice:create": "Create and edit draft invoices",
  "invoice:approve": "Approve invoices",
  "invoice:issue": "Issue invoices",
  "invoice:void": "Void invoices / issue credit notes",
  "billing_run:manage": "Run monthly billing",
  "price_list:manage": "Edit the service price list",
  "payment:read": "View payments",
  "payment:record": "Record payments",
  "payment:reconcile": "Reconcile payments",
  "expense:read": "View expenses",
  "expense:create": "Record expenses",
  "expense:approve": "Approve expenses",
  "payroll:read": "View payroll cost register",
  "payroll:manage": "Import / edit payroll cost register",
  "payable:read": "View what the company owes",
  "payable:manage": "Add and settle payables",
  "period:close": "Close accounting periods",
  "finance:read": "View revenue, margin and P&L",
  // Reporting
  "dashboard:executive": "View company-wide executive dashboard",
  "report:read": "View reports",
  "report:export": "Export reports",
  // Administration
  "user:read": "View users",
  "user:manage": "Create, suspend users and assign roles",
  "role:read": "View roles and permissions",
  "role:manage": "Edit roles and permissions",
  "master_data:manage": "Manage reference data",
  "system:reset": "Clear demo data (administrators only)",
  "reminder_rule:manage": "Manage reminder rules",
  "audit:read": "View audit log",
  "integration:manage": "Manage integrations",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export type RoleKey =
  | "ADMIN"
  | "DEPT_HEAD"
  | "ACCOUNT_MANAGER"
  | "HR"
  | "FINANCE"
  | "OPS_SUPERVISOR"
  | "EXECUTIVE"
  | "AUDITOR";

const READ_ONLY: PermissionKey[] = ALL_PERMISSIONS.filter(
  (p) => p.endsWith(":read") || p === "client:read_all" || p === "task:read_all",
);

export const ROLES: Record<
  RoleKey,
  { name: string; description: string; requiresMfa: boolean; permissions: PermissionKey[] }
> = {
  ADMIN: {
    name: "System Administrator",
    description: "Configure roles, users, master data and integrations; access audit logs",
    requiresMfa: true,
    permissions: ALL_PERMISSIONS,
  },
  DEPT_HEAD: {
    name: "Department Head",
    description: "Department-wide records and dashboards; assigns accounts; approves escalations",
    requiresMfa: false,
    permissions: [
      "overview:read", "client:read", "client:read_all", "client:create", "client:update", "client:archive", "client:assign",
      "contract:read", "contract:manage",
      "employee:read", "employee:create", "employee:update", "allocation:manage",
      "document:read", "document:manage",
      "task:read", "task:read_all", "task:create", "task:update",
      "case:read", "case:create", "case:update", "case:close", "case:reopen",
      "escalation:read", "escalation:raise", "escalation:manage",
      "invoice:read", "payment:read", "expense:read", "finance:read",
      "dashboard:executive", "report:read", "report:export",
      "user:read", "role:read",
      "task_category:manage",
    ],
  },
  ACCOUNT_MANAGER: {
    name: "Account Manager",
    description: "Manages assigned clients, their employees, requests and tasks",
    requiresMfa: false,
    permissions: [
      "overview:read", "client:read", "client:update",
      "contract:read",
      "employee:read", "employee:create", "employee:update", "allocation:manage",
      "document:read", "document:manage",
      "task:read", "task:create", "task:update",
      "case:read", "case:create", "case:update", "case:close",
      "escalation:read", "escalation:raise",
      "invoice:read", "payment:read", "expense:read", "expense:create", "finance:read",
      "report:read",
    ],
  },
  HR: {
    name: "HR / Employee Operations",
    description: "Employee records, onboarding, transfers, exits and HR cases",
    requiresMfa: false,
    permissions: [
      "overview:read", "client:read", "client:read_all",
      "employee:read", "employee:create", "employee:update", "employee:archive", "employee:import",
      "employee:read_sensitive", "compensation:read", "compensation:manage", "allocation:manage",
      "document:read", "document:manage",
      "task:read", "task:create", "task:update",
      "case:read", "case:create", "case:update", "case:close",
      "escalation:read", "escalation:raise",
      "payroll:read", "payroll:manage",
      "report:read",
    ],
  },
  FINANCE: {
    name: "Finance",
    description: "Invoices, collections, expenses, payroll cost and P&L",
    requiresMfa: true,
    permissions: [
      "overview:read", "client:read", "client:read_all", "contract:read", "contract:manage",
      "employee:read", "compensation:read",
      "task:read", "task:create", "task:update",
      "case:read", "escalation:read", "escalation:raise",
      "invoice:read", "invoice:create", "invoice:approve", "invoice:issue", "invoice:void",
      "billing_run:manage",
      "payment:read", "payment:record", "payment:reconcile",
      "expense:read", "expense:create", "expense:approve",
      "payroll:read", "payroll:manage", "payable:read", "payable:manage", "period:close", "finance:read", "price_list:manage",
      "dashboard:executive", "report:read", "report:export",
    ],
  },
  OPS_SUPERVISOR: {
    name: "Operations Supervisor",
    description: "Attendance and field operations, tasks and assigned cases",
    requiresMfa: false,
    permissions: [
      "overview:read", "client:read", "employee:read", "document:read",
      "task:read", "task:read_all", "task:create", "task:update",
      "case:read", "case:create", "case:update",
      "escalation:read", "escalation:raise",
      "task_category:manage",
    ],
  },
  EXECUTIVE: {
    name: "Executive / Management",
    description: "Read-only aggregated dashboards and reports",
    requiresMfa: false,
    permissions: [
      "overview:read", "client:read", "client:read_all", "employee:read",
      "task:read", "case:read", "escalation:read",
      "invoice:read", "payment:read", "expense:read", "finance:read",
      "dashboard:executive", "report:read", "report:export",
    ],
  },
  AUDITOR: {
    name: "Auditor / Compliance",
    description: "Read-only record history and audit logs",
    requiresMfa: false,
    permissions: [...new Set<PermissionKey>([...READ_ONLY, "audit:read"])],
  },
};

/** Permissions that open a page. Each module adds its own as it ships. */
export const PAGE_PERMISSIONS: PermissionKey[] = ["overview:read", "client:read", "employee:read", "task:read", "case:read", "escalation:read", "invoice:read", "finance:read", "expense:read", "payroll:read", "payable:read", "period:close", "report:read", "user:read", "role:read", "master_data:manage", "reminder_rule:manage", "audit:read"];

const GROUP_PREFIXES: { key: string; prefixes: string[] }[] = [
  { key: "clients", prefixes: ["client", "contract"] },
  { key: "workforce", prefixes: ["employee", "compensation", "allocation", "document"] },
  { key: "operations", prefixes: ["task", "task_category", "case", "escalation"] },
  { key: "finance", prefixes: ["invoice", "billing_run", "payment", "expense", "payroll", "payable", "period", "finance", "price_list"] },
  { key: "reporting", prefixes: ["dashboard", "report"] },
  { key: "admin", prefixes: ["user", "role", "system", "master_data", "reminder_rule", "audit", "integration"] },
];

/** Every permission exactly once: pages first, then by business area. */
export const PERMISSION_GROUPS: { key: string; permissions: PermissionKey[] }[] = [
  { key: "pages", permissions: PAGE_PERMISSIONS },
  ...GROUP_PREFIXES.map((g) => ({
    key: g.key,
    permissions: ALL_PERMISSIONS.filter((p) => g.prefixes.includes(p.split(":")[0]) && !PAGE_PERMISSIONS.includes(p)),
  })),
];
