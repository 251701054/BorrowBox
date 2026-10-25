BorrowBox first-fix notes
========================

What was fixed:
- Added POST /api/auth/register, POST /api/auth/login, and GET /api/auth/me.
- Added bcrypt password hashing and JWT token generation/verification.
- Added jsonwebtoken to package.json.
- Added configurable CORS origins through FRONTEND_URL.
- Added config.js and loaded it before app.js/auth.js so the API URL is controlled in one place.
- Updated login/dashboard scripts to use the shared configurable API URL.

Before running:
1. Open a terminal in this project folder.
2. Run: npm install
3. Create a private .env file (do not commit it) with:
   DB_HOST=your_mysql_host
   DB_PORT=3306
   DB_USER=your_mysql_user
   DB_PASSWORD=your_mysql_password
   DB_NAME=your_database_name
   JWT_SECRET=replace_with_a_long_random_secret
   FRONTEND_URL=http://localhost:5500
4. Confirm your users table contains:
   user_id, full_name, email, role, password_hash
   email should have a UNIQUE constraint.
5. Start the API: npm start
6. Serve the HTML frontend with VS Code Live Server, not file://.
7. Open login.html and test registering a Student/Staff account, then sign in.

For deployment:
- Set FRONTEND_URL to the exact Vercel frontend origin (no trailing slash; multiple origins comma-separated).
- In config.js, set window.BORROWBOX_API_URL to the deployed backend URL ending in /api, e.g. https://your-api-host.example/api.
- Never put database credentials in frontend files or commit .env.

Important:
This first fix restores the missing authentication endpoints. It does not yet implement complete per-user data filtering or apply authentication/admin middleware to every existing equipment/borrowing/reservation/maintenance endpoint. Do not treat the app as production-secure until those authorization checks are added and tested.
