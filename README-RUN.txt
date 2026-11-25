BorrowBox — corrected project

FOLDER STRUCTURE
- frontend/: static HTML/CSS/JS pages
- backend/: Express API with JWT authentication and MySQL access

SETUP (Windows / PowerShell)
1. Ensure your MySQL BorrowBox database and required tables already exist.
2. In backend/, copy .env.example to .env and set your own MySQL password and a long random JWT_SECRET. Never share or upload .env.
3. Open a terminal in backend/ and run: npm install
4. Start the API with: npm start
5. Check http://localhost:3000/api/health. It should report database connected.
6. Open a second terminal in frontend/ and run: npx serve . (or use VS Code Live Server).
7. Open the served login.html page, register a Student/Staff account, and sign in.
8. To create an Admin, promote an existing account directly in MySQL using a trusted process. Public signup cannot create Admin accounts.

FIXES INCLUDED
- Removed the accidentally bundled backend/.env so private DB/JWT secrets are not redistributed.
- Removed the insecure hard-coded database password fallback.
- Restricted equipment create/update/delete routes to Admin users.
- Borrowing/reservation list endpoints return only the signed-in user's records unless the account is Admin.
- Borrowing and reservation creation use the authenticated user ID from the server, not a user ID supplied by the browser.
- Removed the manual user-ID field from the borrowing form.
- Added validation for equipment IDs and dates and safer database connection cleanup.

NOTE
The project still requires a matching MySQL schema and an existing Admin account for administrator-only pages. The API cannot be fully integration-tested without your local database.
