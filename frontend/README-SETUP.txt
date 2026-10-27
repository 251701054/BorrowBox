# BorrowBox authentication integration

## Files
- `server.js`: backend with bcrypt registration, JWT login, token verification, and admin-only API checks.
- `app.js`: frontend API helper sends bearer token, redirects unauthenticated users to login, shows logged-in role/name, and logs out.
- `auth.js`, `auth.css`, `login.html`: sign-in/sign-up page.
- `package.json`: includes jsonwebtoken.

## Install
In PowerShell, open the backend folder and run:
```powershell
npm install
```

In `borrowbox-backend/.env`, preserve existing DB values and add a private secret:
```env
JWT_SECRET=your-long-random-secret
```
Generate a secret with:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ensure `users` has `user_id`, `full_name`, `email`, `role`, and `password_hash`; `email` should be unique. This integration expects roles `Student`, `Staff`, `Admin`.

## Important
1. Replace the existing backend `server.js` with this version, but review your own local server first if it contains changes newer than the supplied project file.
2. Replace the frontend `app.js`, and keep the other HTML/CSS/JS files in the frontend folder.
3. Start backend with `npm start`.
4. Serve the frontend using VS Code Live Server (avoid opening via `file://`).
5. Open `login.html`, register a Student/Staff account, then sign in.
6. Admin accounts must be created by an administrator/database operator; public registration cannot create Admin.
7. Frontend hiding is only UX. API admin endpoints are checked server-side. Student data filtering for borrowings/reservations should be added separately before real multi-user deployment.
