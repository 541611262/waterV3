# Water Filter Reminder System V3

A web application to track and remind customers when to replace their water filters. Runs entirely client-side; no backend server required.

## Features

### Accounts
- **Local mode** (default): data stays in the current browser; an admin account is created on first launch, then regular accounts can register; password recovery via security question. Passwords and answers are stored as salted PBKDF2 hashes, never in plain text
- **Cloud mode**: colleagues sign in to the same site with their own accounts; members see only their own customers, admins see everything. Accounts are created by the admin in the Tencent CloudBase console and access is enforced by server-side security rules. See [DEPLOY.md](DEPLOY.md) (Chinese)
- Change password; admin user-management panel (promote / demote)

### Customer Management (customer → installation records)
- Each customer can have multiple installation records (different sites, models or batches); each record has its own filter reminder
- Customer: name, province, region, long-term partner flag, follow-up records
- Installation record: address, contact person, phone, installation date, model, quantity, location, filter purchase date, replacement interval, notes, water-test flag, unpaid flag, unpaid reminder interval
- When adding a record with an existing customer name, it is attached to that customer
- Search (name / contact / phone / address / model); filter by region, flags (unpaid / water test / long-term partner) and month
- Next replacement date = latest of installation date, filter purchase date and replacement records + interval (default 90 days)
- Replacement records (per installation) and follow-up records (per customer): add, edit, view

### Reminders
- Dashboard: overdue / this week / this month / next month, plus payments to chase, each list exportable
- Unpaid reminders every N days (default 30) from the latest follow-up or sale date; tick "paid in full" when adding a follow-up to clear them
- Notification center (mark all as read)
- Daily reminder popup after login (overdue / due today / payments due / weekly overview), with "remind me later"

### Import / Export
- Same 19-column layout as the reference spreadsheet (格式样板), one row per installation record
- Import .xlsx / .xls / .csv (WPS compatible): header auto-detection; dates like `2011.9.9`, `23.10.11`, `2025-01-15` or Excel serials; merged cells
- Re-importing the same sheet updates existing records instead of duplicating them; files exported by older V3 versions still import
- Export Excel (reference layout, phones stored as text), CSV, or a replacement-record detail sheet
- Download an import template

## Usage

1. Clone this repository
2. In the project directory, run a local server:
   ```bash
   python -m http.server 8000
   ```
3. Open `http://localhost:8000` in your browser

You can also open `index.html` directly in a browser.

For shared, multi-device use, deploy to Tencent CloudBase following [DEPLOY.md](DEPLOY.md) and set the environment ID in `config.js`.

## Sample Data

In `examples/`:
- `客户数据示例.csv` — sample in the current 19-column import format
- `测试数据_V3格式.csv`, `测试数据_旧格式.csv` — legacy import formats, for compatibility testing

## Technical Details

- Frontend: HTML5, CSS3, JavaScript
- Data storage: browser localStorage (local mode) or Tencent CloudBase document database (cloud mode; `cloud.js`, rules in `cloudbase/`)
- Excel parsing: SheetJS 0.20.3 bundled in `vendor/` (no overseas CDN)
- In local mode, data stays in the current browser and does not sync across devices — export backups regularly
- When upgrading, existing data is converted to the customer → installation structure automatically; the old data is kept in the browser as a backup

## Related

- [waterv3-pro](https://github.com/541611262/waterv3-pro) — experimental React + TypeScript rewrite based on an earlier version

## License

MIT
