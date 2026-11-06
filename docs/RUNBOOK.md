# EntityGate runbook

For whoever deploys and looks after the system. Commands run from the project root.

## First deployment

1. Copy `.env.example` to your hosting provider's secret settings and fill it in. These must be set:
   - `DATABASE_URL`
   - `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`
   - `ENCRYPTION_KEY`. **Back it up apart from the database.** Without it, encrypted IDs (iqama, passport) can't be read.
   - `COMPANY_NAME`, `COMPANY_VAT_NUMBER`, `COMPANY_CR_NUMBER`, `COMPANY_ADDRESS`, which print on invoices.
   - `SMTP_URL`. Without it, reminder emails are logged as skipped and only in-app notifications work.
2. Make sure `AUTH_MFA_ENFORCED` isn't `false`, `AUTH_SIGNIN_RATE_LIMIT` is unset, and no `SEED_*` values are present.
3. Apply the database changes, then create roles, reference data and the first administrator:

   ```bash
   npm run db:deploy
   BOOTSTRAP_ADMIN_EMAIL=you@company.com npm run db:bootstrap
   ```

   The one-time password prints once. The administrator must change it and set up 2FA at first sign-in.
4. Build and start the app with `npm run build`, then `npm start`, or use the `Dockerfile`.
5. Check `GET /api/health` returns 200, and that the log shows `[jobs] scheduler started`.

Never run `npm run db:seed` or `npm run seed:demo` in production. Both refuse when `NODE_ENV=production`.

## Database connections

The app opens up to `DB_POOL_SIZE` connections (default 5) plus 3 for the scheduler, per instance. Supabase's session pooler allows 15 in total, and going over it locks out every client with `EMAXCONNSESSION`. Keep the sum under the limit, or use a larger pool size if you run more instances.

## Backups

The system holds two things that need backing up:

| What | Where | How |
|---|---|---|
| Database | PostgreSQL | Provider's daily backups with point-in-time recovery. Confirm they're on for your plan. |
| Uploaded files | `STORAGE_DIR` on disk | Copy with your server backup, because the database only holds pointers to them. |

Also keep `ENCRYPTION_KEY` and `BETTER_AUTH_SECRET` in your secrets manager.

**Test a restore before go-live, then at least quarterly:** restore into a separate database, point a staging copy at it, sign in, open an invoice and download one attachment. This hasn't been rehearsed yet.

## Scheduled jobs

Reminders and client health run hourly inside the app, started from `src/instrumentation.ts`, with pg-boss keeping job state in the database. If you run several instances, pg-boss stops a job running twice. Failures appear in the app log with the `[jobs]` prefix. To see what was sent, open **Notifications** or query `notification_deliveries`.

## Monthly finance routine

1. Record and approve the month's expenses.
2. **Finance > Payroll cost:** build from pay records or import a file, then confirm.
3. **Billing > Billing runs:** build drafts, review them, approve, then issue all.
4. Record payments as they arrive.
5. **Finance > Month close:** close once the checklist is clear.

A closed month rejects new expenses, payroll changes, billing runs and voids. Corrections after closing go in the current month, such as a credit note. Reopening is possible, and is recorded in the audit log.

## Common problems

| Symptom | Likely cause | Fix |
|---|---|---|
| `EMAXCONNSESSION` in logs, pages failing | Too many database connections | Lower `DB_POOL_SIZE`, stop stray processes |
| No reminders arriving | `SMTP_URL` unset, or a rule is off | Check Notifications and **Reminder rules** |
| Scheduler fails with "self-signed certificate" | SSL mode on the database URL | `src/server/jobs.ts` handles `sslmode=require`; check the URL |
| Everyone sent to 2FA setup | Expected for roles requiring 2FA | Enroll, or review the role under **Roles & access** |
| Billing run shows "No pay record" | Employee has no compensation for the month | Add it, cancel the run, build again |

## Development only

```bash
npm run seed:demo        # realistic demo data through the real API; the app must be running
npm run db:clean-tests   # removes what the live test suite leaves behind
```
