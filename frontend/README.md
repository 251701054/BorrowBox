# BorrowBox — Admin user actions patch

This patch adds administrator-only role assignment and user removal to People & Roles.

## Apply
1. Back up your project first.
2. Replace `server.js`, `app.js`, `users.html`, and `style.css` with the files here.
3. Merge the `package.json` dependency update and run `npm install` in the backend folder.
4. Add a long, random `JWT_SECRET` to your `.env` (never commit `.env`).
5. Restart the backend and sign in using an existing Admin account.

## Features and safeguards
- Admins can assign `Student`, `Staff`, or `Admin`.
- Admins can remove users when database relationships allow it.
- Prevents deleting/demoting the signed-in admin and protects the last administrator.
- Server-side authorization protects `/api/users`; hiding controls in the browser is not the security boundary.
- If foreign keys prevent deletion because of borrowing/reservation history, the API returns a clear error and recommends changing the role instead.

## Important existing dependency note
The supplied server imports `jsonwebtoken`, but the supplied `package.json` did not list it; this patch adds it. Role changes do not revoke existing JWTs immediately, so for production you should check the user's current database role during authorization or implement token revocation.
