# Water Filter Reminder System V3

A web application to track and remind customers when to replace their water filters. Runs entirely client-side; no backend server required.

## Features

### Accounts
- User registration and login
- Password recovery with security questions
- Change password
- Admin user management panel

### Customer Management
- Add, edit and delete customers
- Search by customer name, contact person or phone
- Filter by region and month
- Sort ascending / descending by date
- Automatic next-replacement date calculation (custom interval, or default when left blank)
- Filter replacement history: add, edit, view

### Reminders
- Reminder dashboard: due today, this week, this month, next month — each list exportable
- Notification center (mark all as read)
- Daily reminder popup after login (urgent / due today / weekly overview), with "remind me later"

### Import / Export
- Import CSV / Excel (.csv, .xlsx, .xls), compatible with Windows WPS
- Export customer data and detailed history records
- Download sample file

## Usage

1. Clone this repository
2. In the project directory, run a local server:
   ```bash
   python -m http.server 8000
   ```
3. Open `http://localhost:8000` in your browser

You can also open `index.html` directly in a browser.

## Sample Data

In `examples/`:
- `客户数据示例.csv` — sample in the current import format
- `测试数据_旧格式.csv` — legacy import format, for compatibility testing

## Technical Details

- Frontend: HTML5, CSS3, JavaScript
- Data storage: browser localStorage
- Data stays in each user's own browser and does not sync across devices — export backups regularly

## Related

- [waterv3-pro](https://github.com/541611262/waterv3-pro) — experimental React + TypeScript rewrite based on an earlier version

## License

MIT
