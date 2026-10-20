require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

app.get("/", (req, res) => {
  res.json({ message: "BorrowBox API is running" });
});

app.get("/api/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS databaseConnected");
    res.json({ status: "ok", database: rows[0].databaseConnected === 1 ? "connected" : "unknown" });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Database connection failed" });
  }
});

// Equipment
app.get("/api/equipment", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT equipment_id, name, category, description, available_quantity FROM equipment ORDER BY equipment_id DESC"
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Could not load equipment" });
  }
});

app.post("/api/equipment", async (req, res) => {
  const { name, category, description = "", available_quantity = 1 } = req.body;
  const quantity = Number(available_quantity);

  if (!name || !category || !Number.isInteger(quantity) || quantity < 0) {
    return res.status(400).json({ error: "name, category, and a non-negative integer available_quantity are required" });
  }

  try {
    const [result] = await pool.execute(
      "INSERT INTO equipment (name, category, description, available_quantity) VALUES (?, ?, ?, ?)",
      [name.trim(), category.trim(), description, quantity]
    );
    res.status(201).json({ message: "Equipment added", equipment_id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: "Could not add equipment" });
  }
});

app.put("/api/equipment/:id", async (req, res) => {
  const { name, category, description = "", available_quantity } = req.body;
  const quantity = Number(available_quantity);

  if (!name || !category || !Number.isInteger(quantity) || quantity < 0) {
    return res.status(400).json({ error: "name, category, and a non-negative integer available_quantity are required" });
  }

  try {
    const [result] = await pool.execute(
      "UPDATE equipment SET name = ?, category = ?, description = ?, available_quantity = ? WHERE equipment_id = ?",
      [name.trim(), category.trim(), description, quantity, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Equipment not found" });
    res.json({ message: "Equipment updated" });
  } catch (error) {
    res.status(500).json({ error: "Could not update equipment" });
  }
});

app.delete("/api/equipment/:id", async (req, res) => {
  try {
    const [result] = await pool.execute("DELETE FROM equipment WHERE equipment_id = ?", [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: "Equipment not found" });
    res.json({ message: "Equipment deleted" });
  } catch (error) {
    res.status(409).json({ error: "Could not delete equipment. It may be referenced by a borrowing, reservation, or maintenance record." });
  }
});

// Users
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

app.post("/api/users", async (req, res) => {
  const { full_name, email, role = "Student" } = req.body;
  if (!full_name || !email || !["Student", "Staff", "Admin"].includes(role)) {
    return res.status(400).json({ error: "full_name, email, and a valid role are required" });
  }

  try {
    const [result] = await pool.execute(
      "INSERT INTO users (full_name, email, role) VALUES (?, ?, ?)",
      [full_name.trim(), email.trim(), role]
    );
    res.status(201).json({ message: "User added", user_id: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "That email is already registered" });
    res.status(500).json({ error: "Could not add user" });
  }
});

// Borrowings
app.get("/api/borrowings", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.borrowing_id, u.full_name, e.name AS equipment_name,
             b.borrow_date, b.due_date, b.return_date, b.status
      FROM borrowings b
      JOIN users u ON b.user_id = u.user_id
      JOIN equipment e ON b.equipment_id = e.equipment_id
      ORDER BY b.borrowing_id DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Could not load borrowing records" });
  }
});

app.post("/api/borrowings", async (req, res) => {
  const { user_id, equipment_id, due_date } = req.body;
  if (!Number.isInteger(Number(user_id)) || !Number.isInteger(Number(equipment_id)) || !due_date) {
    return res.status(400).json({ error: "user_id, equipment_id, and due_date are required" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [items] = await connection.execute(
      "SELECT available_quantity FROM equipment WHERE equipment_id = ? FOR UPDATE",
      [Number(equipment_id)]
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
      [Number(user_id), Number(equipment_id), due_date]
    );
    await connection.execute(
      "UPDATE equipment SET available_quantity = available_quantity - 1 WHERE equipment_id = ?",
      [Number(equipment_id)]
    );
    await connection.commit();
    res.status(201).json({ message: "Borrowing created", borrowing_id: result.insertId });
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ error: "The user or equipment ID does not exist" });
    res.status(500).json({ error: "Could not create borrowing" });
  } finally {
    connection.release();
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
    const [rows] = await pool.query(`
      SELECT r.reservation_id, u.full_name, e.name AS equipment_name,
             r.reservation_date, r.status
      FROM reservations r
      JOIN users u ON r.user_id = u.user_id
      JOIN equipment e ON r.equipment_id = e.equipment_id
      ORDER BY r.reservation_id DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Could not load reservations" });
  }
});

app.post("/api/reservations", async (req, res) => {
  const { user_id, equipment_id, reservation_date } = req.body;
  if (!Number.isInteger(Number(user_id)) || !Number.isInteger(Number(equipment_id))) {
    return res.status(400).json({ error: "Valid user_id and equipment_id are required" });
  }
  try {
    const [result] = await pool.execute(
      "INSERT INTO reservations (user_id, equipment_id, reservation_date, status) VALUES (?, ?, ?, 'Pending')",
      [Number(user_id), Number(equipment_id), reservation_date || new Date().toISOString().slice(0, 10)]
    );
    res.status(201).json({ message: "Reservation created", reservation_id: result.insertId });
  } catch (error) {
    if (error.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ error: "The user or equipment ID does not exist" });
    res.status(500).json({ error: "Could not create reservation" });
  }
});

app.patch("/api/reservations/:id/status", async (req, res) => {
  const { status } = req.body;
  if (!["Pending", "Approved", "Cancelled"].includes(status)) {
    return res.status(400).json({ error: "status must be Pending, Approved, or Cancelled" });
  }
  try {
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
  try {
    const [rows] = await pool.query(`
      SELECT m.maintenance_id, e.name AS equipment_name,
             m.issue_description, m.maintenance_date, m.status
      FROM maintenance m
      JOIN equipment e ON m.equipment_id = e.equipment_id
      ORDER BY m.maintenance_id DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Could not load maintenance records" });
  }
});

app.post("/api/maintenance", async (req, res) => {
  const { equipment_id, issue_description, maintenance_date } = req.body;
  if (!Number.isInteger(Number(equipment_id)) || !issue_description) {
    return res.status(400).json({ error: "equipment_id and issue_description are required" });
  }
  try {
    const [result] = await pool.execute(
      "INSERT INTO maintenance (equipment_id, issue_description, maintenance_date, status) VALUES (?, ?, ?, 'Pending')",
      [Number(equipment_id), issue_description.trim(), maintenance_date || new Date().toISOString().slice(0, 10)]
    );
    res.status(201).json({ message: "Maintenance record created", maintenance_id: result.insertId });
  } catch (error) {
    if (error.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ error: "Equipment ID does not exist" });
    res.status(500).json({ error: "Could not create maintenance record" });
  }
});

app.patch("/api/maintenance/:id/status", async (req, res) => {
  const { status } = req.body;
  if (!["Pending", "In Progress", "Completed"].includes(status)) {
    return res.status(400).json({ error: "Invalid maintenance status" });
  }
  try {
    const [result] = await pool.execute(
      "UPDATE maintenance SET status = ? WHERE maintenance_id = ?",
      [status, req.params.id]
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

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`BorrowBox API running at http://localhost:${port}`);
});
