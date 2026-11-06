# EntityGate — Business Plan & Technical Plan

> **الحالة:** مسودة للمراجعة — ممنوع البدء في الكود قبل الموافقة.
> **التاريخ:** 6 Nov 2026
> **المصادر:** (1) `EntityGate_SRS_v1_Draft.docx` (2) الـ prototype على ChatGPT (3) محادثة الكلاينت.
> كل حاجة مش متأكدين منها معلَّمة بـ **[❓ Qn]** ومرجعها في القسم الأخير (Open Questions).

---

## 0. ملخص تنفيذي

**EntityGate** نظام تشغيل داخلي (Operations Hub) لشركة سعودية بتقدم خدمة **"الكيان + الكفالة"** (نموذج قريب من *Employer of Record*) للشركات الأجنبية اللي عايزة تشتغل في السعودية (نوكيا/HMD، شاومي، Vivo، ...).
الشركة بتكفل موظفي العميل، بتدفع رواتبهم ومصاريفهم الحكومية، وبعدين بتفوتر العميل بالتكلفة + هامش ربح.

النظام بيحل 3 مشاكل أساسية:
1. **الفلوس:** حساب دقيق للمستحق على كل عميل، الفواتير، التحصيل، والـ Margin الحقيقي لكل عميل.
2. **التذكير:** عدم فوات أي استحقاق (فاتورة متأخرة، إقامة بتنتهي، تجديد كفالة، خروج وعودة) — لأن التأخير هنا = غرامات حكومية أو مشاكل قانونية.
3. **التشغيل:** كل طلب/مهمة/مشكلة ليها owner وdeadline وhistory بدل الإكسيل والواتساب.

---

## 1. استخراج المتطلبات (من المصادر الثلاثة)

### 1.1 مقارنة المصادر — إيه موجود فين

| Feature | محادثة الكلاينت | SRS | Prototype | القرار |
|---|:-:|:-:|:-:|---|
| Dashboard (Revenue, Margin, HC per sponsor) | ✅ | ✅ RPT | ✅ Overview | MVP |
| Project/Account Manager view (قسمه: طلبات، مكاسب، مصاريف، أرباح) | ✅ | جزئي (Department Head / AM) | ❌ | MVP — dashboard بـ scope حسب الدور |
| Clients + عدد موظفين + Cases + تقارير تعثّر | ✅ | ✅ ACC | ✅ Accounts (Health: Strong/Watch/At risk) | MVP |
| Employees + import من HR | ✅ | ✅ EMP-01..06 | ✅ | MVP (Excel import)، Phase 2 (API) |
| Sponsor (EntityGate vs شركة سعودية تانية) | ✅ | ❌ (Sponsored/Non-sponsored/GOSI بس) | ✅ عمود Sponsor | MVP — جدول `sponsors` **[❓ Q3]** |
| Tasks (عميل + داخلية) | ✅ | ✅ TSK | ✅ My work queue | MVP |
| Cases/Requests بـ stages + SLA | ضمنياً (إصدار تأشيرة، عقد، تجديد) | ✅ CAS | ✅ 6 stages | MVP |
| Escalations | ❌ | ✅ CAS-04 | ✅ | MVP |
| **Payments reminders / Notifications قوية** | ✅ **"من أهم الأجزاء"** | GEN-03 (Should) | ❌ | **MVP — أولوية قصوى** (ترقية من Should لـ Must) |
| Billing: فاتورة شهرية محسوبة من عدد الموظفين | ✅ | FIN-01 (تسجيل يدوي بس) | ✅ (عرض بس) | MVP — **Billing run أوتوماتيك** |
| فاتورة تجديد كفالة | ✅ | ❌ | ❌ | MVP **[❓ Q5]** |
| Payments/Collections + Aging | ضمنياً | ✅ FIN-02/05 | ✅ | MVP |
| PO / Credit notes / Recoverable costs | ❌ | ❌ | ✅ Commercial controls | MVP (PO + credit note)، Recoverable = جزء من Expenses |
| **Finance: مصاريف + P&L + تقارير** | ✅ | FIN-03 (Should) | ❌ | MVP |
| رواتب الموظفين (إحنا بندفعها) | ✅ | ❌ "Payroll out of MVP" | ✅ case "payroll processing" | MVP = **تسجيل تكلفة الرواتب** (مش صرف بنكي) **[❓ Q6]** |
| Documents + expiry (إقامة، عقد، تأمين) | ضمنياً | EMP-05 (Should) | ✅ Expiring ≤60 days | MVP (لأنها مصدر أهم الـ reminders) |
| Audit trail | ❌ | ✅ IAM-03 | ❌ | MVP |
| Global search | ❌ | ✅ GEN-01 | ✅ | MVP |
| Integrations (HR/CRM/Payroll) | ✅ "مشترك مع HR وCRM" | Phase 2 | "Integration hub — planned" | Phase 2 **[❓ Q9]** |
| AI lead engine | ❌ | Phase 3 | ❌ | Phase 3 |
| Arabic UI | — | "to be confirmed" | ❌ | البنية جاهزة لـ RTL من اليوم الأول **[❓ Q12]** |

> **ملاحظة مهمة:** الـ SRS اتكتب بعقلية "registry" (تسجيل فواتير يدوي، الرواتب خارج النطاق)، لكن الكلاينت في المحادثة عايز النظام **يحسب** المستحق ويطلع الفاتورة ويحسب الأرباح. الخطة دي ماشية مع كلام الكلاينت (لأنه هو صاحب القرار) مع احترام قيود الـ SRS (الصرف البنكي الفعلي والتعامل مع منصات الحكومة خارج النطاق).

### 1.2 قائمة الـ Features الكاملة (Functions)

**A. Identity & Admin**
- Login (email + password + MFA للأدوار الحساسة)، logout، session expiry، reset password.
- Users / Teams / Roles / Permissions (RBAC + account scope).
- Master data: sponsors, regions/locations, case categories, expense categories, task types, SLA policies, holidays calendar.
- Audit log viewer (filters by actor/entity/date).

**B. Clients (Accounts)**
- CRUD client (code, legal name, CR number, VAT number, country of parent company, contacts, status lifecycle: Prospect → Onboarding → Active → Suspended → Exited).
- Account owner (AM) + supporting team + history of ownership changes.
- Contracts: start/end, billing model, rate card, payment terms, documents, renewal reminders.
- Account workspace بـ tabs: Overview · Employees · Cases · Billing · Tasks · Documents · Finance (P&L للعميل).
- Health score (Strong / Watch / At risk) — محسوب من: overdue invoices + overdue cases + margin < threshold **[❓ Q10]**.
- "تقارير التعثّر": Client issues report (متأخرات، cases مفتوحة، escalations).

**C. Employees**
- Employee master (ID, name AR/EN, nationality, iqama no., passport, job title, sponsor, classification: Sponsored / Non-sponsored / GOSI, status: Onboarding / Active / Offboarding / Exited).
- Allocations (effective-dated): employee ↔ client ↔ location ↔ reporting manager — مع منع التداخل على مستوى الـ DB.
- Compensation (مقيدة الصلاحية): basic, housing, transport, other allowances — effective-dated.
- Documents + expiry: Iqama, passport, work permit, medical insurance, contract, exit/re-entry visa.
- Lifecycle workflows: Joiner / Transfer / Renewal / Exit مع checklists (زي "Operations checklist" في الـ prototype).
- Excel import مع row-level validation + exception report + dry-run قبل الـ commit.

**D. Tasks**
- Task: type (Client / Internal)، linked client/employee/case، owner، due، priority، status، checklist، comments، attachments، completion evidence.
- Views: My tasks · Team queue · Overdue · Department priorities · Kanban + list.
- Recurring tasks (مثلاً "Confirm attendance" كل شهر لكل عميل).

**E. Cases / Service Requests**
- Categories: إصدار خروج وعودة، تجديد إقامة، إصدار عقد، نقل كفالة، Onboarding، Final settlement، Payroll processing، ...
- Stages (configurable): Received → Under review → Execution → QC → Client update → Closed (+ Reopened).
- SLA per category/severity، first response، breach flags، auto-escalation.
- Closure يتطلب resolution note + evidence + صلاحية.
- Cost capture: لو الـ case ليه رسوم حكومية → بتتسجل expense مرتبطة بالموظف/العميل (recoverable أو لا).

**F. Escalations**
- Raise (manual) أو auto من breach.
- Severity (Critical/High/Medium/Low)، business impact (مبلغ أو عدد موظفين)، owner، open-for days، update log.
- SLA policy: Critical update خلال 4 ساعات، High خلال يوم عمل (من الـ prototype).

**G. Billing & Invoices**
- **Monthly billing run:** يختار الشهر → يجيب كل الـ allocations الفعّالة لكل عميل → يحسب (prorated بالأيام) حسب الـ billing model → يضيف المصاريف الـ recoverable اللي لسه ما اتفوترتش → يطلع **Draft invoices** للمراجعة → Approve → Issue.
- One-off invoices: تجديد كفالة، رسوم خاصة.
- Credit notes، PO tracking ("Missing PO")، VAT 15%.
- Invoice PDF (bilingual) + رقم تسلسلي غير قابل للتكرار.
- Statuses: Draft → Pending approval → Issued → Partially paid → Paid / Overdue / Disputed / Void.

**H. Payments & Collections**
- تسجيل تحصيلات (partial / full)، allocation على فاتورة أو أكتر، payment proof، reconciliation status.
- Aging buckets (Current / 1–30 / 31–60 / 60+)، Outstanding = amount − applied payments (UAT-05).

**I. Reminders & Notifications (أولوية قصوى)**
- **Reminder engine** يشتغل كل ساعة/يوم ويولّد تنبيهات من:
  - فواتير قربت أو عدّت تاريخ الاستحقاق (D-7, D-3, D0, D+1, D+7, D+30).
  - مستحقات علينا (payables): رواتب الشهر، GOSI، تأمين، رسوم حكومية **[❓ Q7]**.
  - مستندات بتنتهي (Iqama/Passport/Insurance/Contract) — 90/60/30/7 يوم.
  - تجديد كفالة/عقود العملاء.
  - Tasks/Cases overdue أو SLA breach.
- قنوات: In-app (bell + inbox) · Email · (Phase 2: WhatsApp/SMS **[❓ Q8]**).
- Escalation ladder: لو التنبيه ما اتعملّوش acknowledge → يروح للمدير بعد X.
- Digest يومي لكل مستخدم + digest أسبوعي للإدارة.
- إعدادات قواعد التذكير configurable من الـ Admin.

**J. Finance**
- Payroll cost register (شهري لكل موظف — import من HR/Payroll أو يدوي) — **تسجيل تكلفة، مش صرف**.
- Expenses: direct (مرتبطة بعميل/موظف — تأشيرات، إقامات، تأمين) و indirect/overhead (اشتراكات، مواقع، إيجار...). كل expense: recoverable؟ billed؟ approved؟
- P&L: per client / per AM (project) / per month / company-wide.
- Margin dashboard + definitions مكتوبة جوه النظام (RPT-04).
- Period close (قفل الشهر — يمنع التعديل بعد الإقفال إلا بـ adjustment entry).

**K. Dashboards & Reports**
- **Executive dashboard:** Revenue MTD/YTD، Contribution margin، Net profit، HC by sponsor/classification/client، receivables & overdue، open escalations، trends 6/12 شهر.
- **Project/Account Manager dashboard:** نفس الـ widgets بس scoped على عملاؤه: طلبات، إيرادات، مصاريف، أرباح، tasks اليوم.
- **Department head:** Today's priorities، team workload، SLA performance.
- Global filters (client, manager, region, period) مشتركة على كل الـ widgets (UAT-06) + drill-down للـ records.
- Exports: CSV / XLSX / PDF + log لكل export.

### 1.3 الـ User Flows الأساسية

```
WF-01 New client
  AM ينشئ client (Prospect) → يرفع العقد + يحدد billing model & rate card
  → Dept Head يعمل Approve → Status = Active → يظهر في الـ dashboard

WF-02 New joiner
  HR/AM ينشئ employee (Onboarding) + documents → Case "Onboarding" + checklist
  → HR approval → Allocation (effective_from) → يدخل في الـ headcount والـ billing run الجاي

WF-03 Service request (مثال: خروج وعودة)
  Case جديد (category, employee, client) → assign → Execution → تسجيل الرسوم كـ expense (recoverable)
  → QC → Client update → Close (resolution + evidence). SLA breach → auto escalation

WF-04 Monthly billing
  Finance يفتح Billing run لشهر X → النظام يحسب drafts لكل عميل (allocations × rate + recoverables)
  → مراجعة/تعديل → Approve → Issue (رقم + PDF) → Reminders تشتغل على الـ due date

WF-05 Collection
  تسجيل payment → allocate على invoice(s) → status يتحدث → aging + dashboard يتحدثوا

WF-06 Month close & P&L
  تسجيل payroll cost + expenses للشهر → reconciliation → Close period → P&L نهائي لكل عميل

WF-07 Daily operations
  المدير يفتح Dashboard → Today's priorities → يوزع tasks → owners يحدّثوا → supervisor يشوف الاستثناءات

WF-08 Reminder lifecycle
  Engine يكتشف استحقاق → notification للـ owner → acknowledge/snooze/resolve
  → لو مفيش action → escalate للمدير → لو اتحل → يتقفل تلقائي
```

---

## 2. Business Plan

### 2.1 الهدف
بناء **مصدر حقيقة واحد** لعمليات الكفالة والتشغيل والفوترة، يضمن:
- صفر استحقاقات فايتة (فواتير/مستندات/تجديدات).
- رؤية margin حقيقية لكل عميل ولكل مدير مشروع.
- تشغيل قابل للتتبّع والمراجعة (audit) بدل الإكسيل.

### 2.2 الجمهور (المستخدمين)
| Persona | بيعمل إيه | أهم شاشة |
|---|---|---|
| الإدارة العليا / Owner | يتابع الإيراد والربح والمخاطر | Executive dashboard |
| Department Head (زي "Mohammed A.") | يوزع العملاء والمهام، يوافق على escalations | Overview + Escalations |
| Account / Project Manager | يدير عملاؤه وموظفينهم وطلباتهم | AM dashboard + Account workspace |
| HR / Employee Ops | بيانات الموظفين، المستندات، الـ lifecycle | Employees |
| Finance | الفواتير، التحصيل، المصاريف، P&L | Billing + Finance |
| Operations Supervisor | الحضور والمهام الميدانية | Tasks + Cases |
| Auditor | قراءة فقط للـ history | Audit log |

> النظام **داخلي فقط** في الـ MVP (مفيش بوابة للعميل أو للموظف) — حسب الـ SRS.

### 2.3 القيمة المقدمة (Value Proposition)
- **حماية الإيراد:** تذكير قوي + escalation ladder → تقليل التأخير في التحصيل وتقليل الغرامات الحكومية.
- **دقة الحسابات:** فواتير محسوبة أوتوماتيك من الـ allocations (prorated) بدل الحساب اليدوي، و margin محسوب بنفس التعريف في كل مكان.
- **الشفافية:** كل مدير شايف أرقام قسمه، والإدارة شايفة الكل مع drill-down للمصدر.
- **قابلية التوسع:** عملاء أكتر بنفس الفريق؛ جاهز للربط مع HR/Payroll/CRM.

### 2.4 نموذج العمل (كما فهمناه — محتاج تأكيد)
```
Revenue من العميل  = (تكلفة الموظف: راتب + بدلات + GOSI + تأمين + رسوم حكومية)
                    + Service fee (نسبة % أو مبلغ ثابت للرأس)
                    + Recoverable expenses (تأشيرات، خروج وعودة، ...) 
                    + فواتير تجديد كفالة
Direct costs        = الرواتب اللي بندفعها + GOSI + تأمين + رسوم حكومية + مصاريف مباشرة غير مستردة
Contribution margin = Revenue − Direct costs          (الـ prototype بيوضح 12–17%)
Net profit          = Contribution margin − Overhead (مصاريف تشغيل عامة)
```
الأرقام في المحادثة ("50%" و "8%") مش واضحة ومتعارضة مع الـ prototype → **[❓ Q1, Q2]**.

### 2.5 مؤشرات النجاح (KPIs للنظام نفسه)
- 0 مستندات انتهت بدون تنبيه مسبق.
- DSO (متوسط أيام التحصيل) ينزل — baseline يتحدد بعد أول شهرين.
- 100% من الفواتير الشهرية تطلع من الـ billing run (مش يدوي).
- تقفيل الشهر المالي في ≤ 5 أيام عمل.
- كل case/task ليه owner و due date.

### 2.6 المراحل (Phases)
| Phase | المحتوى |
|---|---|
| **MVP (Phase 1)** | Auth/RBAC + Audit · Clients & Contracts · Employees & Allocations & Documents · Excel import · Tasks · Cases · Escalations · **Billing run + Invoices + Payments** · **Reminders engine (in-app + email)** · Expenses + Payroll cost register · P&L/Margin · Dashboards (Exec + AM) · Exports |
| **Phase 2** | HR/Payroll/CRM integrations (API) · WhatsApp/SMS · ZATCA e-invoicing (لو الفواتير الرسمية هتطلع من هنا) · Advanced SLA reports · Scheduled reports · Approval delegation · Arabic UI كامل (لو مش MVP) |
| **Phase 3** | AI lead engine · Forecasting (cash flow, renewals) · Automations متقدمة · Client portal |

---

## 3. Technical Plan

### 3.1 Architecture
**مشروع واحد Next.js (App Router) — الـ frontend والـ backend في نفس الـ repo.**

```
┌─────────────────────────────── Next.js app ───────────────────────────────┐
│  app/(auth)/*           → login, MFA, reset                                │
│  app/(app)/*            → Server Components (pages) + Client islands       │
│  app/api/v1/*           → Route Handlers (REST, versioned) ← الـ backend    │
│  app/api/cron/*         → endpoints محمية بيستدعيها الـ scheduler           │
│                                                                            │
│  src/server/                                                               │
│    modules/<module>/    → service.ts (business logic) · repo.ts · schema.ts │
│    auth/ rbac/ audit/   → cross-cutting                                    │
│    jobs/                → reminder engine, billing run, imports            │
│  src/lib/money.ts       → كل الحسابات المالية (Decimal فقط)                 │
└────────────────────────────────────────────────────────────────────────────┘
          │ Prisma                      │ pg-boss (queue على نفس Postgres)
          ▼                             ▼
     PostgreSQL 16  ◄──────────  Worker process (نفس الكود، entry مختلف)
          │
     S3-compatible storage (documents) + ClamAV scan
```

**قرارات أساسية:**
1. **Layered:** Route handler (validation + auth) → Service (business rules + transactions + audit) → Repository (Prisma). الـ UI ما يلمسش الـ DB مباشرة؛ Server Components بتنادي الـ services نفسها (مش fetch للـ API) عشان الأداء، والـ API routes بتستخدم نفس الـ services → قاعدة واحدة للصلاحيات.
2. **Authorization في الـ service layer** (مش بس الـ UI) — UAT-07: أي edit ممنوع عن طريق الـ API يترفض ويتسجل.
3. **Money:** كل المبالغ `NUMERIC(14,2)` في الـ DB، `Prisma.Decimal` / `decimal.js` في الكود. ممنوع `number` لأي مبلغ. Rounding = half-up على مستوى سطر الفاتورة، والإجماليات = مجموع السطور المقرّبة. Unit tests لكل formula.
4. **Effective dating:** allocations والـ compensation والـ rate cards كلها `effective_from / effective_to` — عشان أي تقرير تاريخي يطلع صح.
5. **No hard deletes** للبيانات الحرجة: `archived_at` + audit (BR-07).
6. **Jobs:** pg-boss (queue فوق Postgres — مفيش Redis) + worker process منفصل؛ cron schedules جوه pg-boss.
7. **Time zone:** كل الـ timestamps UTC في الـ DB، والعرض/حساب الـ overdue بتوقيت `Asia/Riyadh` + working calendar (BR-05).

### 3.2 Folder structure (مقترح)
```
src/
  app/
    (auth)/login, mfa, reset
    (app)/
      dashboard/            ← Exec / AM حسب الدور
      clients/[id]/(overview|employees|cases|billing|tasks|documents|finance)
      employees/[id]
      tasks/
      cases/[id]
      escalations/
      billing/(invoices|runs|payments|credit-notes)
      finance/(pnl|expenses|payroll|periods)
      notifications/
      reports/
      admin/(users|roles|master-data|reminder-rules|audit|imports)
    api/v1/...              ← نفس التقسيم
    api/cron/...
  server/
    modules/{clients,employees,allocations,tasks,cases,escalations,
             billing,payments,finance,notifications,reports,imports,documents}
    auth/ rbac/ audit/ jobs/ db/
  components/ui/            ← design system primitives
  components/patterns/      ← DataTable, KPI tile, FilterBar, EntityHeader, Timeline...
  lib/ money.ts dates.ts i18n/
prisma/ schema.prisma migrations/ seed.ts
tests/ unit/ integration/ e2e/
```

### 3.3 Database (PostgreSQL) — Schema & Relations

#### ERD مختصر
```
users ─┬─< user_roles >── roles ──< role_permissions
       └─< team_members >── teams
sponsors ──< employees ──< allocations >── clients ──< contracts ──< rate_cards
                │  └─< compensations                 │
                ├─< documents (polymorphic)          ├─< client_contacts
                ├─< payroll_items >── payroll_runs   ├─< account_assignments (owner history)
                └─< expenses >─────────────────────┤
clients ──< invoices ──< invoice_lines ──(source)── allocations | expenses
invoices ──< payment_allocations >── payments
clients/employees ──< cases ──< case_events, case_comments
cases ──< escalations ──< escalation_updates
tasks (→ client?, employee?, case?) ──< task_comments, task_checklist_items
notifications >── reminder_rules ; notification_deliveries
audit_events (append-only) ; import_jobs ──< import_rows ; attachments
```

#### الجداول (الحقول الأساسية)

**Identity & Admin**
| Table | Key fields |
|---|---|
| `users` | id, email, name, phone, status, mfa_enabled, last_login_at, locale |
| `roles` / `permissions` / `role_permissions` / `user_roles` | permission = `resource:action` (e.g. `invoice:approve`) |
| `teams`, `team_members` | department / AM team |
| `account_assignments` | client_id, user_id, role (`owner`/`support`), effective_from, effective_to — **ده اللي بيعمل account scope + history (ACC-05)** |
| `audit_events` | id, actor_id, entity_type, entity_id, action, before JSONB, after JSONB, ip, created_at — **append-only** (trigger يمنع UPDATE/DELETE) |
| `master_data` tables | `regions`, `locations`, `case_categories`, `expense_categories`, `holidays`, `sla_policies` |

**Clients**
| Table | Key fields |
|---|---|
| `clients` | id, code (unique), legal_name, display_name, cr_number, vat_number, parent_company, country, industry, status (enum lifecycle), health (computed/cached), created_by, archived_at |
| `client_contacts` | client_id, name, role, email, phone, is_billing_contact |
| `contracts` | client_id, number, start_date, end_date, status, payment_terms_days, currency, billing_model (`COST_PLUS_PERCENT` / `FIXED_PER_HEAD` / `COST_PLUS_FIXED` **[❓ Q2]**), renewal_notice_days |
| `rate_cards` | contract_id, effective_from, effective_to, fee_percent, fee_per_head, sponsorship_renewal_fee, includes (JSONB: GOSI? insurance? ...) |

**Workforce**
| Table | Key fields |
|---|---|
| `sponsors` | id, name, cr_number, type (`OWN` / `THIRD_PARTY`) |
| `employees` | id, employee_no (unique), name_en, name_ar, nationality, iqama_no (encrypted), passport_no (encrypted), dob, job_title, sponsor_id, classification (`SPONSORED`/`NON_SPONSORED`/`GOSI`), status, joined_at, exited_at, hr_external_id |
| `allocations` | employee_id, client_id, location_id, manager_user_id, effective_from, effective_to, billable (bool) — **EXCLUDE constraint (btree_gist) يمنع تداخل allocation فعّالة لنفس الموظف (BR-01)** |
| `compensations` | employee_id, effective_from, effective_to, basic, housing, transport, other, gosi_employer, insurance_monthly — **صلاحية Finance/HR فقط** |
| `documents` | owner_type (`EMPLOYEE`/`CLIENT`/`CONTRACT`), owner_id, type (`IQAMA`/`PASSPORT`/`WORK_PERMIT`/`INSURANCE`/`CONTRACT`/`EXIT_REENTRY`...), number, issue_date, expiry_date, attachment_id, status |
| `lifecycle_workflows` + `workflow_steps` | type (`JOINER`/`TRANSFER`/`RENEWAL`/`EXIT`), employee_id, step, owner_id, status, due_at |

**Operations**
| Table | Key fields |
|---|---|
| `tasks` | id, title, description, kind (`CLIENT`/`INTERNAL`), client_id?, employee_id?, case_id?, owner_id, created_by, due_at, priority, status, completed_at, recurrence_rule? |
| `task_comments`, `task_checklist_items` | |
| `cases` | id, number (`CS-1048`), category_id, client_id?, employee_id?, source, severity, owner_id, stage, sla_due_at, first_response_at, resolved_at, closed_at, resolution_note, breached (bool) |
| `case_events` | case_id, from_stage, to_stage, actor_id, note, created_at (full history — BR-04) |
| `escalations` | id, case_id?, client_id, severity, title, impact_amount?, impact_text, owner_id, status, raised_by, raised_at, resolved_at |
| `escalation_updates` | escalation_id, author_id, note, created_at |

**Billing & Payments**
| Table | Key fields |
|---|---|
| `billing_runs` | id, period (`2026-09`), status (`DRAFT`/`APPROVED`/`ISSUED`), created_by, approved_by |
| `invoices` | id, number (sequence, unique, gapless per year), client_id, billing_run_id?, type (`MONTHLY`/`SPONSORSHIP_RENEWAL`/`ONE_OFF`/`CREDIT_NOTE`), period_start, period_end, issue_date, due_date, currency, subtotal, vat_rate, vat_amount, total, status, po_number?, issued_by, pdf_attachment_id |
| `invoice_lines` | invoice_id, description, source_type (`ALLOCATION`/`EXPENSE`/`FEE`/`MANUAL`), source_id, employee_id?, quantity (days/heads), unit_amount, amount |
| `payments` | id, client_id, received_at, amount, method, reference, proof_attachment_id, reconciled (bool) |
| `payment_allocations` | payment_id, invoice_id, amount — **outstanding = total − Σ allocations (UAT-05)** |

**Finance**
| Table | Key fields |
|---|---|
| `payroll_runs` | period, status, source (`IMPORT`/`MANUAL`/`HR_API`) |
| `payroll_items` | payroll_run_id, employee_id, client_id (snapshot), gross, gosi, other_costs, total_cost |
| `expenses` | id, category_id, kind (`DIRECT`/`OVERHEAD`), client_id?, employee_id?, case_id?, amount, vat, incurred_at, vendor, recoverable (bool), billed_invoice_line_id?, status (`PENDING`/`APPROVED`), attachment_id |
| `accounting_periods` | period, status (`OPEN`/`CLOSED`), closed_by, closed_at |
| `v_client_monthly_pnl` (view / materialized view) | client_id, period, revenue, direct_cost, contribution_margin, margin_pct |

**Notifications & Reminders**
| Table | Key fields |
|---|---|
| `reminder_rules` | id, trigger (`INVOICE_DUE`/`DOC_EXPIRY`/`CONTRACT_RENEWAL`/`TASK_OVERDUE`/`CASE_SLA`/`PAYABLE_DUE`), offsets_days (int[] e.g. `{-7,-3,0,1,7,30}`), channels, recipients (owner/role/manager), escalate_after_hours, active |
| `notifications` | id, user_id, rule_id?, entity_type, entity_id, title, body, severity, dedupe_key (unique — يمنع التكرار), status (`UNREAD`/`READ`/`ACKED`/`SNOOZED`/`RESOLVED`), snoozed_until, created_at |
| `notification_deliveries` | notification_id, channel, status, sent_at, error |
| `payables` | type (`SALARY`/`GOSI`/`INSURANCE`/`GOV_FEE`/`OTHER`), due_date, amount, status — **التزامات علينا** **[❓ Q7]** |

**Imports & Files**
| Table | Key fields |
|---|---|
| `import_jobs` | type (`EMPLOYEES`/`PAYROLL`/`ALLOCATIONS`), file_attachment_id, status, total_rows, ok_rows, error_rows, mode (`DRY_RUN`/`COMMIT`) |
| `import_rows` | job_id, row_no, payload JSONB, errors JSONB, result |
| `attachments` | id, storage_key, filename, mime, size, sha256, scan_status, uploaded_by |
| `integration_syncs` | system, started_at, finished_at, result, error, retry_count (INT-02) |

#### ربط كل Function بالجداول (أمثلة رئيسية)
| Function | Tables | المنطق |
|---|---|---|
| Headcount per sponsor (Dashboard) | allocations ⨝ employees ⨝ sponsors | allocations active على تاريخ X، group by sponsor/classification — المجموع لازم = إجمالي HC (BR-02) |
| Monthly billing run | allocations, compensations, rate_cards, expenses(recoverable, unbilled) → invoices, invoice_lines | لكل client: Σ (cost × days_active/days_in_month) + fee + recoverables + VAT |
| Sponsorship renewal invoice | documents(IQAMA expiry) / rate_cards.sponsorship_renewal_fee → invoices(type=RENEWAL) | يتولّد draft قبل الانتهاء بـ X يوم **[❓ Q5]** |
| Outstanding / Aging | invoices, payment_allocations | outstanding = total − Σ allocations؛ bucket حسب today − due_date |
| P&L per client | invoices(issued, period) − payroll_items − expenses(DIRECT) | contribution margin |
| Company P&L | الكل − expenses(OVERHEAD) | net profit |
| AM dashboard | نفس الحسابات بفلتر `client_id IN account_assignments(user)` | |
| Client health | invoices overdue, cases breached, margin_pct | rules configurable |
| Reminders | reminder_rules × (invoices, documents, contracts, tasks, cases, payables) → notifications | job كل ساعة؛ dedupe_key = rule+entity+offset |
| Audit | audit_events | Prisma extension على كل write في الـ services |

### 3.4 تقسيم الـ Modules (بترتيب التبعية)
1. **Core** — auth, RBAC, audit, master data, layout/design system, attachments.
2. **Clients & Contracts** (يعتمد على Core).
3. **Employees, Sponsors, Allocations, Documents, Import** (يعتمد على Clients).
4. **Tasks** و **Cases + Escalations** (يعتمدوا على Clients/Employees).
5. **Notifications & Reminder engine** (يعتمد على كل اللي فوق كمصادر — بيتبني بدري ويتوسّع مع كل module).
6. **Billing & Payments** (يعتمد على Allocations + Contracts).
7. **Finance** (Payroll cost, Expenses, Periods, P&L) (يعتمد على Billing).
8. **Dashboards & Reports** (يعتمد على الكل).

### 3.5 Tech Stack — Libraries & Tools
| Area | Choice | ليه |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript strict** | مطلوب؛ RSC للأداء |
| DB | **PostgreSQL 16** | مطلوب؛ exclusion constraints, views, JSONB |
| ORM | **Prisma 6** (+ raw SQL للـ reports الثقيلة والـ constraints) | migrations ناضجة، Decimal، type-safety |
| Auth | **Better Auth** (email/password + TOTP 2FA + sessions) | MFA للأدوار الحساسة (NFR-05)؛ قابل لـ SSO لاحقاً **[❓ Q11]** |
| Validation | **Zod** | مشترك بين الـ forms والـ API |
| Money | **decimal.js** / Prisma.Decimal | دقة الحسابات |
| Dates | **date-fns + @date-fns/tz** | Asia/Riyadh، working days |
| Jobs / cron | **pg-boss** | queue + schedules على Postgres |
| UI primitives | **Tailwind CSS v4 + Radix (via shadcn/ui، customized بالكامل)** | accessibility + تحكم كامل في الشكل |
| Tables | **TanStack Table v8** + virtualization (TanStack Virtual) | جداول كبيرة بفلاتر وsorting |
| Data fetching (client) | **TanStack Query** + Server Actions للـ mutations البسيطة | |
| Forms | **React Hook Form + Zod resolver** | |
| Charts | **Recharts** (أو visx للـ custom) | |
| Motion | **Motion (framer-motion)** | |
| Command palette | **cmdk** | ⌘K global search |
| Excel | **ExcelJS** (import/export) | |
| PDF | **@react-pdf/renderer** | فواتير bilingual |
| i18n / RTL | **next-intl** + logical CSS properties | جاهزية العربي |
| Email | **React Email + Resend / SMTP** | |
| Files | S3-compatible (MinIO أو cloud) + **ClamAV** | GEN-02 |
| Search | Postgres `pg_trgm` + full-text | مفيش حاجة لـ Elastic في الـ MVP |
| Logging / errors | **pino** + **Sentry** | NFR-09 |
| Testing | **Vitest** (unit — خصوصاً money) · **Testcontainers** (integration على Postgres حقيقي) · **Playwright** (E2E + UAT-01..07) | |
| Quality | ESLint, Prettier, Husky + lint-staged, GitHub Actions CI | |
| Deploy | **Docker** (app + worker) على hosting داخل السعودية **[❓ Q13]** | PDPL + الـ worker محتاج process دائم |
| API testing | **Postman CLI** collections في الـ CI | متاح على الجهاز |

**Skills مطلوبة في الفريق:** Next.js/RSC، PostgreSQL (constraints/views/indexing)، Prisma، تصميم نظم مالية (Decimal, rounding, period close)، RBAC، background jobs، UI engineering عالي المستوى، فهم أنظمة السعودية (إقامة، GOSI، Qiwa/Muqeem، VAT/ZATCA).

### 3.6 Milestones — ترتيب التنفيذ
> التقديرات تقريبية لـ developer واحد full-stack، وهتتظبط بعد الرد على الأسئلة.

| # | Milestone | Deliverables | Exit criteria | تقدير |
|---|---|---|---|---|
| **M0** | Foundations | Repo، CI، Docker، Prisma + Postgres، design tokens + primitives، App shell (sidebar/topbar/⌘K)، Auth + MFA، RBAC، Audit، Attachments، Seed | Login شغال، دور ممنوع يترفض من الـ API ويتسجل (UAT-07) | 2 أسابيع |
| **M1** | Clients & Contracts | CRUD، lifecycle، owner assignment + history، contracts + rate cards، account workspace shell | UAT-01 (account scoping) | 1.5 أسبوع |
| **M2** | Workforce | Sponsors، Employees، Allocations (exclusion constraint)، Compensation، Documents + expiry، Lifecycle checklists، **Excel import (dry-run + exceptions)** | UAT-02 (classification totals = HC) | 2.5 أسبوع |
| **M3** | Notifications core | Notification center، inbox، reminder rules engine، email، digest — مربوط بـ document expiry | تنبيه انتهاء إقامة يوصل in-app + email مرة واحدة بس (dedupe) | 1.5 أسبوع |
| **M4** | Tasks / Cases / Escalations | Tasks (list + kanban + recurring)، Cases بـ stages + SLA + history، Escalations + auto-escalate، ربطهم بالـ reminders | UAT-03, UAT-04 | 2.5 أسبوع |
| **M5** | Billing & Collections | Billing run + drafts + approve + issue، invoice PDF، credit notes، PO، payments + allocations، aging، invoice reminders | UAT-05؛ اختبار billing على بيانات شهر حقيقي ومطابقته يدوياً مع Finance | 3 أسابيع |
| **M6** | Finance | Payroll cost import، Expenses (direct/overhead/recoverable)، Payables + reminders، Period close، P&L per client / AM / company | P&L لشهر تجريبي = حساب Finance اليدوي بالهللة | 2 أسبوع |
| **M7** | Dashboards & Reports | Exec dashboard، AM dashboard، Dept head view، global filters + drill-down، exports + logging | UAT-06 | 2 أسبوع |
| **M8** | Hardening & UAT | Performance (NFR-02)، security review، backups/restore test، Arabic (لو MVP)، runbooks، training، UAT مع الكلاينت | Sign-off | 2 أسبوع |

**المجموع التقريبي:** ~19 أسبوع لـ developer واحد (~10–11 أسبوع لـ اتنين بالتوازي بعد M2).
بعد كل milestone: demo للكلاينت على staging.

---

## 4. UI/UX Direction & Design System

### 4.1 الاتجاه: **"Quiet Authority"**
الـ prototype الحالي dark + teal glow + gradients — ده بالظبط الـ look اللي بيبان "AI-generated". هنروح للعكس: **أداة مالية جادة** بإحساس Stripe Dashboard / Linear / Mercury — هادية، كثيفة بالمعلومة، دقيقة، كل pixel له سبب.

**مبادئ:**
1. **Light-first** (Dark mode متاح ومتصمم بنفس العناية، مش inversion).
2. **الأرقام هي البطل:** tabular numerals، alignment يمين للأرقام، عملة بخط أصغر، delta بلون هادي.
3. **لون accent واحد** + ألوان حالة مكتومة. مفيش gradients ولا glow ولا glassmorphism.
4. **Hierarchy بالـ typography والمسافات** مش بالـ boxes والـ borders. Cards قليلة؛ hairlines (1px) بدل الظلال التقيلة.
5. **كثافة قابلة للتحكم:** Comfortable / Compact للجداول.
6. **Keyboard-first:** ⌘K، `G then C` للـ clients، `N` لـ new، `J/K` في الجداول.
7. **كل رقم قابل للنقر** (drill-down) — ومعاه tooltip بتعريف المعادلة و"آخر تحديث".

### 4.2 الألوان (Design tokens)
مستوحاة من **الحبر والورق والنحاس** — هوية سعودية/مؤسسية بدون كليشيهات.

| Token | Light | Dark | الاستخدام |
|---|---|---|---|
| `--bg` | `#F7F6F3` (ورق دافئ) | `#0E1013` | خلفية الصفحة |
| `--surface` | `#FFFFFF` | `#15181D` | Cards/panels |
| `--surface-2` | `#F0EEE9` | `#1B1F25` | hover, table header |
| `--border` | `#E4E1DA` | `#262B33` | hairlines |
| `--text` | `#14171C` (حبر) | `#ECEDEF` | نص أساسي |
| `--text-muted` | `#5F6672` | `#99A0AB` | ثانوي |
| `--primary` | `#1F3A5F` (Ink Navy) | `#8FB0DA` | actions، links، selection |
| `--accent` | `#B07A2A` (Brass) | `#D6A55A` | highlights نادرة، الـ brand mark، focus على KPIs |
| `--success` | `#2F6B4F` | `#6FBF95` | Paid, Strong |
| `--warning` | `#A86A12` | `#E0A64A` | Due soon, Watch |
| `--danger` | `#A23B32` | `#E57A6F` | Overdue, Critical, At risk |
| `--info` | `#2D5D8A` | `#7EB0DE` | |
| Chart palette | Navy `#1F3A5F` · Slate `#6B7A8F` · Brass `#B07A2A` · Sage `#6E8B74` · Clay `#B5654A` · Mist `#A9B4C2` | | |

### 4.3 Typography
| Role | Font | ملاحظات |
|---|---|---|
| UI (Latin) | **Inter Tight** أو **Geist** | Geist أنظف للأرقام؛ نختار واحد بعد عرض نموذجين |
| Display / page titles | **Instrument Serif** (استخدام محدود جداً — عناوين الـ dashboard و الـ empty states) | يدي لمسة "editorial" premium تبعده عن شكل الـ AI |
| Arabic | **IBM Plex Sans Arabic** | متوازن مع اللاتيني، أوزان كاملة |
| Numbers | نفس خط الـ UI بـ `font-variant-numeric: tabular-nums` + **Geist Mono / IBM Plex Mono** للـ IDs (INV-00182, CS-1048) | |

Scale: 12 / 13 / 14 (base) / 16 / 20 / 24 / 32 / 44 — line-height 1.45 للنص، 1.1 للأرقام الكبيرة. Weights: 400 / 500 / 600 فقط.
Spacing: 4px grid. Radius: 6px (inputs/buttons)، 10px (cards)، 999 (pills). Shadows: تقريباً معدومة — `0 1px 0` hairline + shadow خفيفة للـ popovers بس.

### 4.4 Components (المكتبة)
**Primitives:** Button (primary/secondary/ghost/danger, sizes)، Input، Select، Combobox، DatePicker / Period picker، Checkbox، Switch، Textarea، Tooltip، Popover، Dialog، Sheet (side panel)، Tabs، Badge/Status pill، Avatar، Skeleton، Toast.

**Patterns (هي اللي بتعمل الفرق):**
- `KpiTile` — رقم كبير + delta + sparkline + tooltip بالتعريف + click → drill-down.
- `DataTable` — sticky header، column visibility، saved views، inline filters، bulk actions، density، virtualized، export.
- `FilterBar` — global filters (client/manager/region/period) بتتحفظ في الـ URL.
- `EntityHeader` — اسم + status + owner + quick actions + tabs (للـ Client/Employee/Case).
- `Timeline / ActivityFeed` — history الـ case والـ audit.
- `StageTracker` — stages الـ case (Received → Closed).
- `MoneyCell` / `MoneyInput` — عملة، فواصل، negative بالأحمر بين قوسين (أسلوب محاسبي).
- `AgingBar` — stacked bar للـ aging buckets.
- `ExpiryBadge` — "Iqama · 43 days" بلون حسب القرب.
- `NotificationCenter` — inbox بـ ack/snooze/resolve.
- `ImportWizard` — upload → mapping → dry-run results → commit.
- `CommandPalette` (⌘K) — بحث + أوامر.
- `EmptyState` — illustration خطية بسيطة (line art بلون الـ brass) + action واضح.

### 4.5 Motion
- Durations: 120ms (hover/press)، 180ms (popover/tooltip)، 240ms (sheet/dialog)، easing `cubic-bezier(0.2, 0, 0, 1)`.
- **Number roll** للـ KPIs لما الفلتر يتغير (مش عند كل load).
- Layout animation للـ rows لما status يتغير (row يتحرك لمكانه الجديد).
- Sheet من الجنب لتفاصيل الـ record بدل التنقل لصفحة (يحافظ على السياق).
- Skeletons بنفس شكل المحتوى، مفيش spinners في الصفحات.
- احترام `prefers-reduced-motion`.
- ممنوع: bounce، glow، parallax، confetti.

### 4.6 Layout
- Sidebar ثابت 240px (collapsible لـ 64px) مقسّم: Workspace (Overview, Clients, Employees, Tasks, Cases, Escalations) · Money (Billing, Payments, Finance) · System (Reports, Admin).
- Topbar: breadcrumb + global search + period picker + notifications bell + user.
- Content max-width 1440px، grid 12 col.
- RTL: كل الـ spacing بـ logical properties (`ms-`/`me-`) من اليوم الأول.

### 4.7 قبل التنفيذ
- نعمل **2 hi-fi mockups** (Dashboard + Client workspace) بالاتجاه ده للموافقة قبل M0 ما يخلص.

---

## 5. ⚠️ Open Questions — حاجات ناقصة أو مش واضحة

### Business / Finance (أهم حاجة — بتأثر على الحسابات)
- **Q1.** "الشركة الأم بتدينا نسبة 50%" — 50% من إيه بالظبط؟ دفعة مقدمة؟ نسبة من التكاليف؟ وده مختلف عن الـ prototype اللي بيوضح margin 12–17%.
- **Q2.** "مكسبنا حوالي 8%" — ده **service fee** بيتضاف على التكلفة (cost-plus 8%)؟ ولا net margin؟ وهل النسبة ثابتة لكل العملاء ولا لكل عقد نسبته؟ وهل في عملاء بـ مبلغ ثابت للرأس؟
- **Q3.** "موظفين على كفالة شركة سعودية تانية" — مين الشركة دي؟ هل بندفع لها رسوم؟ وهل الموظفين دول بيتفوتروا بنفس الطريقة؟ وإيه الفرق بين "Non-sponsored" و"على كفالة شركة تانية" و"GOSI"؟
- **Q4.** إيه اللي بيدخل في فاتورة العميل الشهرية بالظبط؟ (راتب أساسي، بدلات، GOSI، تأمين طبي، رسوم إقامة/رخصة عمل مقسّطة، خروج وعودة، overtime؟) وهل الـ VAT 15% بيتحسب على الإجمالي ولا على الـ fee بس؟
- **Q5.** "تجديد الكفالة بمبلغ معين" — كام؟ ثابت ولا لكل عميل؟ بيتفوتر إمتى (عند التجديد ولا مقدماً)؟ وهل يقصد تجديد الإقامة ولا تجديد عقد الخدمة مع العميل؟
- **Q6.** الرواتب: هل النظام هيسجل التكلفة بس (والصرف بيتم من البنك/نظام Payroll تاني)؟ ولا مطلوب يطلع ملف WPS أو يتابع حالة الصرف؟ (الـ SRS بيقول الصرف خارج الـ MVP).
- **Q7.** المدفوعات اللي عايزين reminders عليها: **فلوس جاية لنا** (فواتير العملاء) ولا **فلوس علينا** (رواتب، GOSI، رسوم حكومية) ولا الاتنين؟ (افترضنا الاتنين — محتاج تأكيد مع قائمة بالبنود المستحقة علينا ومواعيدها).
- **Q8.** قنوات التذكير: in-app + email كفاية للـ MVP؟ ولا WhatsApp/SMS لازم من الأول؟ ومين يستلم (الـ owner بس، المدير، Finance)؟ وكام مرة؟
- **Q10.** تعريف "تعثّر" العميل / Health (Strong/Watch/At risk) — متأخرات بكام يوم؟ margin أقل من كام؟
- **Q14.** الفواتير الرسمية (Tax invoices) هتطلع من النظام ده ولا من نظام محاسبي تاني (Odoo / Zoho / Qoyod...)؟ لو من هنا → لازم **ZATCA e-invoicing (Fatoora Phase 2)** وده scope كبير.
- **Q15.** العملة: SAR بس؟ ولا في عملاء بيدفعوا USD؟ وسعر الصرف بيتحدد إزاي؟
- **Q16.** Overhead (مصاريف المواقع الرقمية وغيرها) بتتوزع على العملاء/المشاريع في الـ P&L ولا بتفضل على مستوى الشركة؟

### Scope / Integrations
- **Q9.** نظام الـ HR والـ CRM الحاليين إيه (اسمهم)؟ في API؟ ولا الـ import هيبقى Excel في الـ MVP؟ و "Tasks مشتركة مع الـ HR والـ CRM" — يعني نعمل sync للـ tasks؟ ولا النظام ده يبقى هو الـ source؟ ولا بس عرض؟
- **Q17.** "Project Manager" في المحادثة = "Account Manager" في الـ SRS؟ ولا في مستوى "Project" تحت العميل (عميل واحد عنده كذا project)؟
- **Q18.** هل في تعامل مع منصات حكومية (Qiwa, Muqeem, Absher, GOSI) — ولو مش integration، هل بنسجل أرقام المعاملات بس؟
- **Q19.** Escalations و Cases — موجودين في الـ SRS والـ prototype بس الكلاينت ما ذكرهمش. نأكد إنهم في الـ MVP؟

### Technical / Non-functional
- **Q11.** تسجيل الدخول: email/password + MFA؟ ولا عندهم Microsoft 365 / Google Workspace عايزين SSO؟
- **Q12.** اللغة العربية: MVP ولا Phase 2؟ (البنية هتبقى جاهزة في الحالتين).
- **Q13.** الاستضافة: لازم داخل السعودية (PDPL)؟ عندهم provider مفضل؟ مين هيدير السيرفر؟
- **Q20.** عدد المستخدمين المتوقع وعدد الموظفين المكفولين (حالياً 282) — ومعدل النمو.
- **Q21.** في بيانات تاريخية (فواتير/مدفوعات/موظفين قدام) محتاجة migration؟ بأي format؟
- **Q22.** الـ prototype فيه أسماء عملاء حقيقية (Vivo, HMD, Xiaomi...) — هل ممكن ناخد sample data حقيقية (anonymized) للتست، خصوصاً شهر billing كامل للمطابقة؟
- **Q23.** في نسخة تانية من شات ChatGPT "مش كاملة" — لو فيها أي تفاصيل إضافية (formulas، شاشات)، نحتاجها.

---

## 6. الخطوة الجاية
1. مراجعتك للخطة + تعديلاتك.
2. إرسال الـ Open Questions للكلاينت (خصوصاً Q1–Q7 لأنها بتحدد شكل الـ billing والـ P&L).
3. Hi-fi mockups لشاشتين للموافقة على الـ design direction.
4. بعد الموافقة → نبدأ M0.
