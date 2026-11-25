require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { minVersion: "TLSv1.2" },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


app.get("/", (req, res) => {
  res.json({ message: "BorrowBox API is running" });
});


app.get("/api/health", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT 1 AS databaseConnected"
    );

    res.json({
      status: "ok",
      database: rows[0].databaseConnected === 1
        ? "connected"
        : "unknown"
    });

  } catch (error) {
    console.error(
      "DATABASE CONNECTION ERROR:",
      error.code,
      error.message
    );

    res.status(500).json({
      status: "error",
      message: "Database connection failed"
    });
  }
});

// Authentication routes are public; all other /api routes require a JWT.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing. Add it to borrowbox-backend/.env");
}

app.post("/api/auth/register", async (req, res) => {
  const full_name = String(req.body.full_name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = req.body.password;
  const role = req.body.role || "Student";

  if (!full_name || !email || !password || password.length < 8) {
    return res.status(400).json({ error: "Name, email, and a password of at least 8 characters are required." });
  }
  if (!["Student", "Staff"].includes(role)) {
    return res.status(400).json({ error: "Public registration is limited to Student or Staff." });
  }

  try {
    const password_hash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      "INSERT INTO users (full_name, email, role, password_hash) VALUES (?, ?, ?, ?)",
      [full_name, email, role, password_hash]
    );
    res.status(201).json({ message: "Account created. Please sign in.", user_id: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "This email is already registered." });
    console.error("Registration error:", error.message);
    res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = req.body.password;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  try {
    await ensureRoleManagementSchema();
    const [rows] = await pool.execute(
      "SELECT user_id, full_name, email, role, password_hash, token_version FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    if (!rows.length || !rows[0].password_hash || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    const account = rows[0];
    const token = jwt.sign(
      {
        user_id: account.user_id,
        role: account.role,
        token_version: Number(account.token_version ?? 1)
      },
      JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({
      message: "Login successful.",
      token,
      user: { user_id: account.user_id, full_name: account.full_name, email: account.email, role: account.role }
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ error: "Could not sign in." });
  }
});

async function authenticateToken(req, res, next) {
  const header = req.headers.authorization || "";
  const accessToken = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!accessToken) return res.status(401).json({ error: "Please sign in first." });
  try {
    await ensureRoleManagementSchema();
    const claims = jwt.verify(accessToken, JWT_SECRET);
    // Read the current role and token_version from MySQL on every protected request.
    // A stale JWT must not retain administrator permissions after a role change.
    const [rows] = await pool.execute(
      "SELECT user_id, full_name, email, role, token_version FROM users WHERE user_id = ? LIMIT 1",
      [claims.user_id]
    );
    if (!rows.length) return res.status(401).json({ error: "Account no longer exists. Please sign in again." });
    if (claims.token_version !== undefined && Number(rows[0].token_version ?? 1) !== Number(claims.token_version)) {
      return res.status(401).json({ error: "Your session has been invalidated after a role change. Please sign in again." });
    }
    req.user = {
      user_id: rows[0].user_id,
      full_name: rows[0].full_name,
      email: rows[0].email,
      role: rows[0].role
    };
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError" || error.name === "NotBeforeError") {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    console.error("Authentication check failed:", error.message);
    return res.status(500).json({ error: "Could not verify your session." });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "Admin") {
    return res.status(403).json({ error: "Administrator access required." });
  }
  next();
}

app.use("/api", (req, res, next) => {
  if (req.path === "/auth/login" || req.path === "/auth/register" || req.path === "/health") return next();
  return authenticateToken(req, res, next);
});

// Return the current account and its live database role for frontend route guards.
app.get("/api/auth/me", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT user_id, full_name, email, role FROM users WHERE user_id = ? LIMIT 1", [req.user.user_id]);
    if (!rows.length) return res.status(401).json({ error: "Account no longer exists. Please sign in again." });
    // Keep role claims current after an administrator changes a user's role.
    req.user.role = rows[0].role;
    res.json({ user: rows[0] });
  } catch (error) {
    console.error("Current user lookup error:", error.message);
    res.status(500).json({ error: "Could not verify your account." });
  }
});

// Protect management endpoints and state-changing administrator actions.
app.use("/api/equipment", (req, res, next) =>
  ["POST", "PUT", "DELETE"].includes(req.method) ? requireAdmin(req, res, next) : next()
);
app.use("/api/users", requireAdmin);
app.use("/api/maintenance", (req, res, next) =>
  ["PATCH", "PUT", "DELETE"].includes(req.method) ? requireAdmin(req, res, next) : next()
);
app.use("/api/borrowings/:id/return", (req, res, next) => req.method === "PATCH" ? requireAdmin(req, res, next) : next());
app.use("/api/reservations/:id/status", (req, res, next) => req.method === "PATCH" ? requireAdmin(req, res, next) : next());

// Equipment
async function ensureColumn(sql) {
  try {
    await pool.query(sql);
  } catch (error) {
    if (!["ER_DUP_FIELDNAME", "ER_DUP_KEYNAME", "ER_FK_DUP_NAME"].includes(error.code)) {
      console.warn("Schema check note:", error.code || error.message);
    }
  }
}

let roleSchemaReadyPromise = null;
function ensureRoleManagementSchema() {
  if (!roleSchemaReadyPromise) {
    roleSchemaReadyPromise = ensureColumn(
      "ALTER TABLE users ADD COLUMN token_version int NOT NULL DEFAULT 1 AFTER password_hash"
    ).then(() =>
      pool.query(`
        CREATE TABLE IF NOT EXISTS role_audit_logs (
          audit_id int NOT NULL AUTO_INCREMENT,
          target_user_id int NOT NULL,
          previous_role enum('Student','Staff','Admin') NOT NULL,
          new_role enum('Student','Staff','Admin') NOT NULL,
          changed_by_user_id int NOT NULL,
          reason varchar(255) DEFAULT NULL,
          changed_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (audit_id),
          KEY idx_role_audit_target (target_user_id),
          KEY idx_role_audit_actor (changed_by_user_id),
          KEY idx_role_audit_changed_at (changed_at),
          CONSTRAINT role_audit_logs_ibfk_1 FOREIGN KEY (target_user_id) REFERENCES users (user_id) ON DELETE CASCADE,
          CONSTRAINT role_audit_logs_ibfk_2 FOREIGN KEY (changed_by_user_id) REFERENCES users (user_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `)
    ).catch(error => {
      roleSchemaReadyPromise = null;
      console.warn("Role schema check note:", error.code || error.message);
    });
  }
  return roleSchemaReadyPromise;
}

let schemaReadyPromise = null;
function ensureCareMaintenanceSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = Promise.all([
      ensureColumn("ALTER TABLE equipment ADD COLUMN care_instructions text DEFAULT NULL AFTER description"),
      ensureColumn("ALTER TABLE maintenance ADD COLUMN user_id int DEFAULT NULL AFTER equipment_id"),
    ]).then(() =>
      ensureColumn("ALTER TABLE maintenance ADD CONSTRAINT maintenance_ibfk_2 FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE SET NULL")
    );
  }
  return schemaReadyPromise;
}

app.get("/api/equipment", async (req, res) => {
  await ensureCareMaintenanceSchema();
  try {
    const [rows] = await pool.query(
      "SELECT equipment_id, name, category, description, care_instructions, available_quantity FROM equipment ORDER BY equipment_id DESC"
    );
    res.json(rows);
  } catch (error) {
    if (error.code === "ER_BAD_FIELD_ERROR") {
      try {
        const [rows] = await pool.query(
          "SELECT equipment_id, name, category, description, available_quantity FROM equipment ORDER BY equipment_id DESC"
        );
        return res.json(rows);
      } catch (fallbackError) {
        console.error("Equipment fallback load error:", fallbackError.message);
      }
    }
    res.status(500).json({ error: "Could not load equipment" });
  }
});

app.post("/api/equipment", async (req, res) => {
  const { name, category, description = "", care_instructions = null, available_quantity = 1 } = req.body;
  const quantity = Number(available_quantity);

  if (!name || !category || !Number.isInteger(quantity) || quantity < 0) {
    return res.status(400).json({ error: "name, category, and a non-negative integer available_quantity are required" });
  }

  try {
    await ensureCareMaintenanceSchema();
    const [result] = await pool.execute(
      "INSERT INTO equipment (name, category, description, care_instructions, available_quantity) VALUES (?, ?, ?, ?, ?)",
      [name.trim(), category.trim(), description, care_instructions ? String(care_instructions).trim() : null, quantity]
    );
    res.status(201).json({ message: "Equipment added", equipment_id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: "Could not add equipment" });
  }
});

app.put("/api/equipment/:id", async (req, res) => {
  const { name, category, description = "", care_instructions = null, available_quantity } = req.body;
  const quantity = Number(available_quantity);

  if (!name || !category || !Number.isInteger(quantity) || quantity < 0) {
    return res.status(400).json({ error: "name, category, and a non-negative integer available_quantity are required" });
  }

  try {
    await ensureCareMaintenanceSchema();
    const [result] = await pool.execute(
      "UPDATE equipment SET name = ?, category = ?, description = ?, care_instructions = ?, available_quantity = ? WHERE equipment_id = ?",
      [name.trim(), category.trim(), description, care_instructions ? String(care_instructions).trim() : null, quantity, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Equipment not found" });
    res.json({ message: "Equipment updated" });
  } catch (error) {
    res.status(500).json({ error: "Could not update equipment" });
  }
});

app.delete("/api/equipment/:id", async (req, res) => {
  try {
    await ensureCareMaintenanceSchema();
    const [result] = await pool.execute("DELETE FROM equipment WHERE equipment_id = ?", [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: "Equipment not found" });
    res.json({ message: "Equipment deleted" });
  } catch (error) {
    res.status(409).json({ error: "Could not delete equipment. It may be referenced by a borrowing, reservation, or maintenance record." });
  }
});

// Users
const ALLOWED_ROLES = ["Student", "Staff", "Admin"];

app.get("/api/users", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT user_id, full_name, email, role FROM users ORDER BY user_id DESC"
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Could not load users" });
  }
});

app.get("/api/users/audit", async (req, res) => {
  try {
    await ensureRoleManagementSchema();
    const [rows] = await pool.query(`
      SELECT a.audit_id, a.target_user_id,
             tu.full_name AS target_name, tu.email AS target_email,
             a.previous_role, a.new_role,
             a.changed_by_user_id, au.full_name AS changed_by_name,
             a.reason, a.changed_at
      FROM role_audit_logs a
      LEFT JOIN users tu ON a.target_user_id = tu.user_id
      LEFT JOIN users au ON a.changed_by_user_id = au.user_id
      ORDER BY a.audit_id DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (error) {
    console.error("Role audit load error:", error.message);
    res.status(500).json({ error: "Could not load role change audit logs" });
  }
});

app.post("/api/users", async (req, res) => {
  const { full_name, email, role = "Student" } = req.body;
  if (!full_name || !email || !ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: "full_name, email, and a valid role are required" });
  }

  try {
    await ensureCareMaintenanceSchema();
    const [result] = await pool.execute(
      "INSERT INTO users (full_name, email, role) VALUES (?, ?, ?)",
      [full_name.trim(), email.trim().toLowerCase(), role]
    );
    res.status(201).json({ message: "User added", user_id: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "That email is already registered" });
    res.status(500).json({ error: "Could not add user" });
  }
});

app.patch("/api/users/:id/role", async (req, res) => {
  const targetUserId = Number(req.params.id);
  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    return res.status(400).json({ error: "Invalid user ID." });
  }

  const requestedRole = typeof req.body?.role === "string" ? req.body.role.trim() : "";
  if (!ALLOWED_ROLES.includes(requestedRole)) {
    return res.status(400).json({ error: "Invalid role. Allowed roles are Student, Staff, and Admin." });
  }

  const rawReason = req.body?.reason != null ? String(req.body.reason).trim() : "";
  if (rawReason.length > 255) {
    return res.status(400).json({ error: "Reason must be 255 characters or fewer." });
  }
  const reason = rawReason || null;

  let connection;
  try {
    await ensureRoleManagementSchema();
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [targetRows] = await connection.execute(
      "SELECT user_id, full_name, email, role FROM users WHERE user_id = ? FOR UPDATE",
      [targetUserId]
    );
    if (!targetRows.length) {
      await connection.rollback();
      return res.status(404).json({ error: "User not found." });
    }

    const targetUser = targetRows[0];
    if (targetUser.role === requestedRole) {
      await connection.rollback();
      return res.status(400).json({ error: `User already has the ${requestedRole} role.` });
    }

    // Last-administrator protection with row-level locking on all Admin rows
    // so concurrent demotion requests cannot leave BorrowBox without an admin.
    if (targetUser.role === "Admin" && requestedRole !== "Admin") {
      const [adminRows] = await connection.execute(
        "SELECT user_id FROM users WHERE role = 'Admin' FOR UPDATE"
      );
      if (adminRows.length <= 1) {
        await connection.rollback();
        return res.status(409).json({
          error: "Role change denied. BorrowBox must have at least one administrator."
        });
      }
    }

    await connection.execute(
      "UPDATE users SET role = ?, token_version = token_version + 1 WHERE user_id = ?",
      [requestedRole, targetUserId]
    );

    await connection.execute(
      "INSERT INTO role_audit_logs (target_user_id, previous_role, new_role, changed_by_user_id, reason) VALUES (?, ?, ?, ?, ?)",
      [targetUserId, targetUser.role, requestedRole, req.user.user_id, reason]
    );

    await connection.commit();

    const selfDemoted =
      targetUserId === Number(req.user.user_id) &&
      targetUser.role === "Admin" &&
      requestedRole !== "Admin";

    res.json({
      message: `User role successfully changed from ${targetUser.role} to ${requestedRole}.`,
      user: {
        user_id: targetUser.user_id,
        full_name: targetUser.full_name,
        email: targetUser.email,
        role: requestedRole
      },
      previousRole: targetUser.role,
      newRole: requestedRole,
      selfDemoted
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch { /* ignore rollback error */ }
    }
    console.error("Role update error:", error.message);
    res.status(500).json({ error: "Could not update user role." });
  } finally {
    connection?.release();
  }
});

// Borrowings
app.get("/api/borrowings", async (req, res) => {
  try {
    const sql = `
      SELECT b.borrowing_id, b.user_id, b.equipment_id, u.full_name,
             e.name AS equipment_name, b.borrow_date, b.due_date,
             b.return_date, b.status
      FROM borrowings b
      JOIN users u ON b.user_id = u.user_id
      JOIN equipment e ON b.equipment_id = e.equipment_id
      ${req.user.role === "Admin" ? "" : "WHERE b.user_id = ?"}
      ORDER BY b.borrowing_id DESC
    `;
    const [rows] = req.user.role === "Admin"
      ? await pool.query(sql)
      : await pool.execute(sql, [req.user.user_id]);
    res.json(rows);
  } catch (error) {
    console.error("Borrowing list error:", error.message);
    res.status(500).json({ error: "Could not load borrowing records" });
  }
});

app.post("/api/borrowings", async (req, res) => {
  const equipmentId = Number(req.body.equipment_id);
  const dueDate = String(req.body.due_date || "");
  if (!Number.isInteger(equipmentId) || equipmentId < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return res.status(400).json({ error: "A valid equipment_id and due_date (YYYY-MM-DD) are required" });
  }
  if (dueDate <= new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ error: "The due date must be after today" });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [items] = await connection.execute(
      "SELECT available_quantity FROM equipment WHERE equipment_id = ? FOR UPDATE",
      [equipmentId]
    );
    if (!items.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Equipment not found" });
    }
    if (items[0].available_quantity < 1) {
      await connection.rollback();
      return res.status(409).json({ error: "No units of this equipment are available" });
    }

    const [result] = await connection.execute(
      "INSERT INTO borrowings (user_id, equipment_id, borrow_date, due_date, status) VALUES (?, ?, CURDATE(), ?, 'Borrowed')",
      [req.user.user_id, equipmentId, dueDate]
    );
    await connection.execute(
      "UPDATE equipment SET available_quantity = available_quantity - 1 WHERE equipment_id = ?",
      [equipmentId]
    );
    await connection.commit();
    res.status(201).json({ message: "Borrowing created", borrowing_id: result.insertId });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch { /* transaction may not have started */ }
    }
    if (error.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ error: "The equipment record does not exist" });
    console.error("Create borrowing error:", error.message);
    res.status(500).json({ error: "Could not create borrowing" });
  } finally {
    connection?.release();
  }
});

app.patch("/api/borrowings/:id/return", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      "SELECT equipment_id, status FROM borrowings WHERE borrowing_id = ? FOR UPDATE",
      [req.params.id]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Borrowing record not found" });
    }
    if (rows[0].status === "Returned") {
      await connection.rollback();
      return res.status(409).json({ error: "This item has already been returned" });
    }

    await connection.execute(
      "UPDATE borrowings SET return_date = CURDATE(), status = 'Returned' WHERE borrowing_id = ?",
      [req.params.id]
    );
    await connection.execute(
      "UPDATE equipment SET available_quantity = available_quantity + 1 WHERE equipment_id = ?",
      [rows[0].equipment_id]
    );
    await connection.commit();
    res.json({ message: "Equipment marked as returned" });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: "Could not return equipment" });
  } finally {
    connection.release();
  }
});

// Reservations
app.get("/api/reservations", async (req, res) => {
  try {
    const sql = `
      SELECT r.reservation_id, r.user_id, u.full_name, e.name AS equipment_name,
             r.reservation_date, r.status
      FROM reservations r
      JOIN users u ON r.user_id = u.user_id
      JOIN equipment e ON r.equipment_id = e.equipment_id
      ${req.user.role === "Admin" ? "" : "WHERE r.user_id = ?"}
      ORDER BY r.reservation_id DESC
    `;
    const [rows] = req.user.role === "Admin"
      ? await pool.query(sql)
      : await pool.execute(sql, [req.user.user_id]);
    res.json(rows);
  } catch (error) {
    console.error("Reservation list error:", error.message);
    res.status(500).json({ error: "Could not load reservations" });
  }
});

app.post("/api/reservations", async (req, res) => {
  const equipmentId = Number(req.body.equipment_id);
  const reservationDate = String(req.body.reservation_date || new Date().toISOString().slice(0, 10));
  if (!Number.isInteger(equipmentId) || equipmentId < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(reservationDate)) {
    return res.status(400).json({ error: "Valid equipment_id and reservation_date (YYYY-MM-DD) are required" });
  }
  try {
    await ensureCareMaintenanceSchema();
    const [result] = await pool.execute(
      "INSERT INTO reservations (user_id, equipment_id, reservation_date, status) VALUES (?, ?, ?, 'Pending')",
      [req.user.user_id, equipmentId, reservationDate]
    );
    res.status(201).json({ message: "Reservation created", reservation_id: result.insertId });
  } catch (error) {
    if (error.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ error: "The equipment record does not exist" });
    console.error("Create reservation error:", error.message);
    res.status(500).json({ error: "Could not create reservation" });
  }
});

app.patch("/api/reservations/:id/status", async (req, res) => {
  const { status } = req.body;
  if (!["Pending", "Approved", "Cancelled"].includes(status)) {
    return res.status(400).json({ error: "status must be Pending, Approved, or Cancelled" });
  }
  try {
    await ensureCareMaintenanceSchema();
    const [result] = await pool.execute(
      "UPDATE reservations SET status = ? WHERE reservation_id = ?",
      [status, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Reservation not found" });
    res.json({ message: "Reservation status updated" });
  } catch (error) {
    res.status(500).json({ error: "Could not update reservation" });
  }
});

// Maintenance
app.get("/api/maintenance", async (req, res) => {
  await ensureCareMaintenanceSchema();
  try {
    const isAdmin = req.user.role === "Admin";
    const sql = `
      SELECT m.maintenance_id, m.equipment_id, m.user_id,
             u.full_name AS reported_by,
             e.name AS equipment_name, e.category AS equipment_category,
             e.care_instructions,
             m.issue_description, m.maintenance_date, m.status
      FROM maintenance m
      JOIN equipment e ON m.equipment_id = e.equipment_id
      LEFT JOIN users u ON m.user_id = u.user_id
      ${isAdmin ? "" : "WHERE m.user_id = ?"}
      ORDER BY m.maintenance_id DESC
    `;
    const [rows] = isAdmin
      ? await pool.query(sql)
      : await pool.execute(sql, [req.user.user_id]);
    res.json(rows);
  } catch (error) {
    console.error("Maintenance list error:", error.message);
    res.status(500).json({ error: "Could not load maintenance records" });
  }
});

app.post("/api/maintenance", async (req, res) => {
  const equipmentId = Number(req.body.equipment_id);
  const issueDescription = String(req.body.issue_description || "").trim();
  const maintenanceDate = String(req.body.maintenance_date || new Date().toISOString().slice(0, 10)).trim();

  if (!Number.isInteger(equipmentId) || equipmentId < 1 || !issueDescription) {
    return res.status(400).json({ error: "Valid equipment_id and issue_description are required" });
  }
  if (issueDescription.length > 255) {
    return res.status(400).json({ error: "issue_description must be 255 characters or fewer" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(maintenanceDate)) {
    return res.status(400).json({ error: "maintenance_date must be in YYYY-MM-DD format" });
  }

  try {
    await ensureCareMaintenanceSchema();
    const [result] = await pool.execute(
      "INSERT INTO maintenance (equipment_id, user_id, issue_description, maintenance_date, status) VALUES (?, ?, ?, ?, 'Pending')",
      [equipmentId, req.user.user_id, issueDescription, maintenanceDate]
    );
    res.status(201).json({
      message: "Maintenance record created",
      maintenance_id: result.insertId,
      user_id: req.user.user_id,
      status: "Pending"
    });
  } catch (error) {
    if (error.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ error: "Equipment ID does not exist" });
    console.error("Create maintenance error:", error.message);
    res.status(500).json({ error: "Could not create maintenance record" });
  }
});

app.patch("/api/maintenance/:id/status", async (req, res) => {
  const maintenanceId = Number(req.params.id);
  const { status } = req.body;
  if (!Number.isInteger(maintenanceId) || maintenanceId < 1) {
    return res.status(400).json({ error: "Invalid maintenance ID" });
  }
  if (!["Pending", "In Progress", "Completed"].includes(status)) {
    return res.status(400).json({ error: "Invalid maintenance status" });
  }
  try {
    await ensureCareMaintenanceSchema();
    const [result] = await pool.execute(
      "UPDATE maintenance SET status = ? WHERE maintenance_id = ?",
      [status, maintenanceId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Maintenance record not found" });
    res.json({ message: "Maintenance status updated" });
  } catch (error) {
    res.status(500).json({ error: "Could not update maintenance status" });
  }
});

// Dashboard summary
app.get("/api/dashboard", async (req, res) => {
  try {
    const [[equipment]] = await pool.query("SELECT COUNT(*) AS total FROM equipment");
    const [[users]] = await pool.query("SELECT COUNT(*) AS total FROM users");
    const [[borrowings]] = await pool.query("SELECT COUNT(*) AS total FROM borrowings WHERE status = 'Borrowed'");
    const [[reservations]] = await pool.query("SELECT COUNT(*) AS total FROM reservations WHERE status = 'Pending'");
    const [[overdue]] = await pool.query(
      "SELECT COUNT(*) AS total FROM borrowings WHERE status = 'Borrowed' AND due_date < CURDATE()"
    );
    res.json({
      totalEquipment: equipment.total,
      totalUsers: users.total,
      activeBorrowings: borrowings.total,
      pendingReservations: reservations.total,
      overdueBorrowings: overdue.total
    });
  } catch (error) {
    res.status(500).json({ error: "Could not load dashboard summary" });
  }
});

app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON request body." });
  }
  return next(err);
});

const port = Number(process.env.PORT || 3000);
if (require.main === module) {
  app.listen(port, () => {
    console.log(`BorrowBox API running at http://localhost:${port}`);
  });
}

module.exports = app;
