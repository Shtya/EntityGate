# Administrator guide

## Who can do what

Access follows permissions, not role names. Administrators always have everything.

- **Roles & access:** sets what each role can open and do.
- **Users, then a person:** allows or blocks anything for that one person, on top of their roles. A block wins over an allow from a role.

The sidebar follows these settings: if someone is missing a page, it means they lack that page's permission. Each page's permission is listed first under **Pages** on the permissions screen.

Separately, people without "see all clients" (`client:read_all`) only see the clients they're assigned to. So an account manager with invoice access sees invoices for their own clients only.

Everything above is recorded under **Audit log**, which can't be edited, not even by administrators.

## Adding a person

1. **Users > Add user.** Choose their role and copy the temporary password. It's shown once.
2. They set a new password at first sign-in. Roles that handle money or administration must also set up 2FA.
3. For account managers, assign them from the client's page, under **Team**.

If someone loses their 2FA device, use the reset action on their user page.

## Reference data

**Reference data** holds the lists used everywhere: sponsors, regions and locations, case categories with SLA hours, expense categories and public holidays.

- Changes apply immediately to new records.
- Case SLA hours apply to new cases, not open ones.
- A category that already has expenses can't switch between direct and overhead, because that would change past P&L. Add a new category and mark the old one inactive.
- Add each year's public holidays. Escalation update deadlines skip them.

## Reminders

**Reminder rules** decide when reminders go out, such as 30 days before a document expires, and who receives them. Each rule can be turned off. Email needs `SMTP_URL`; in-app notifications always work.

## Commercial terms

These live on each client's contract rather than in the code, so they can differ per client and change over time:

- Billing model: cost plus a percentage, a fee per head, or cost plus a fixed monthly fee
- Fee, VAT rate and payment terms
- Sponsorship renewal fee

To change a fee, add a new rate card with its start date. Past invoices keep the old rate.

## Starting clean

**Settings > Clear all demo data** removes every client, employee, invoice, payment, expense, case, task, file, notification and audit entry, and every account except yours. Roles, permissions and reference lists stay, and invoice numbering restarts.

It asks for the word `CLEAR` and your password, can't be undone, and only works once. After that the data is treated as real and the button is gone. Only administrators see it.

## Exports

Excel, CSV and print each need **Export reports** as well as access to that report. Each one records who exported what, with which filters and how many rows.
