# Water Filter Reminder System

A web application to track and remind users when to replace their water filters.

## Features

- User registration and login system
- Password recovery with security questions
- Admin user management panel
- Client data management
- Automatic reminder date calculations
- CSV data import/export functionality
- Client data sorting by recommended follow-up time

## Installation

1. Clone this repository
2. Navigate to the project directory
3. Run a local server:
   ```bash
   python -m http.server 8000
   ```
4. Open `http://localhost:8000` in your browser

## Usage

### For Users
1. Register an account or login if you already have one
2. Add your water filter information
3. The system will calculate and display when you need to replace your filter
4. You'll see reminders when the replacement time approaches

### For Admins
1. Login with admin credentials
2. Access the admin panel to:
   - Manage all users
   - View system statistics
   - Export data to CSV

## Screenshots

![Login Page](screenshots/login.png)
![Dashboard](screenshots/dashboard.png)
![Admin Panel](screenshots/admin.png)

## Technical Details

- Frontend: HTML5, CSS3, JavaScript
- Data Storage: localStorage
- No backend server required (runs entirely client-side)

## License

MIT License - see LICENSE file for details
