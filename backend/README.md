# BorrowBox backend

## Requirements
- Node.js installed
- MySQL Server running
- Your `BorrowBox` database and tables already created

## Setup on Windows
1. Extract this folder into your project folder, or copy these files into a folder named `backend`.
2. Open that folder in VS Code.
3. In the VS Code terminal, run:
   ```powershell
   npm install
   ```
4. Copy `.env.example` to a new file named `.env`.
5. Open `.env` and replace `put_your_mysql_root_password_here` with the MySQL root password you set during installation. Do not share this file or upload it publicly.
6. Start the backend:
   ```powershell
   npm start
   ```
7. Open `http://localhost:3000/api/health` in your browser. A successful response looks like:
   `{"status":"ok","database":"connected"}`

## API endpoints
- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/equipment`
- `POST /api/equipment`
- `PUT /api/equipment/:id`
- `DELETE /api/equipment/:id`
- `GET /api/users`
- `POST /api/users`
- `GET /api/borrowings`
- `POST /api/borrowings`
- `PATCH /api/borrowings/:id/return`
- `GET /api/reservations`
- `POST /api/reservations`
- `PATCH /api/reservations/:id/status`
- `GET /api/maintenance`
- `POST /api/maintenance`
- `PATCH /api/maintenance/:id/status`

For POST/PUT/PATCH endpoints, send JSON in the request body. Example for adding equipment:
```json
{
  "name": "Headphones",
  "category": "Electronics",
  "description": "Over-ear headphones",
  "available_quantity": 4
}
```

This is a starter educational backend, not a production-ready deployment. Before public deployment, add authentication, authorization, input validation, rate limiting, and stronger operational safeguards.
