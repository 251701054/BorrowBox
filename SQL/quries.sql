-- ==========================================
-- BORROWBOX DATABASE MANAGEMENT SYSTEM
-- Database: Borrowbox2
-- DBMS: MySQL
-- ==========================================

CREATE DATABASE IF NOT EXISTS Borrowbox2;
USE Borrowbox2;

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    role ENUM('Student', 'Staff', 'Admin') NOT NULL DEFAULT 'Student',
    password_hash VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. EQUIPMENT TABLE
CREATE TABLE IF NOT EXISTS equipment (
    equipment_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    available_quantity INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_equipment_quantity
        CHECK (available_quantity >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. BORROWINGS TABLE
CREATE TABLE IF NOT EXISTS borrowings (
    borrowing_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    equipment_id INT NOT NULL,
    borrow_date DATE NOT NULL,
    due_date DATE NOT NULL,
    return_date DATE DEFAULT NULL,
    status ENUM('Borrowed', 'Returned') NOT NULL DEFAULT 'Borrowed',

    CONSTRAINT fk_borrowings_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_borrowings_equipment
        FOREIGN KEY (equipment_id)
        REFERENCES equipment(equipment_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    INDEX idx_borrowings_user (user_id),
    INDEX idx_borrowings_equipment (equipment_id),
    INDEX idx_borrowings_status_due (status, due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. RESERVATIONS TABLE
CREATE TABLE IF NOT EXISTS reservations (
    reservation_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    equipment_id INT NOT NULL,
    reservation_date DATE NOT NULL,
    status ENUM('Pending', 'Approved', 'Cancelled')
        NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_reservations_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_reservations_equipment
        FOREIGN KEY (equipment_id)
        REFERENCES equipment(equipment_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    INDEX idx_reservations_user (user_id),
    INDEX idx_reservations_equipment (equipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. MAINTENANCE TABLE
CREATE TABLE IF NOT EXISTS maintenance (
    maintenance_id INT AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT NOT NULL,
    issue_description TEXT NOT NULL,
    maintenance_date DATE NOT NULL,
    status ENUM('Pending', 'In Progress', 'Completed')
        NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_maintenance_equipment
        FOREIGN KEY (equipment_id)
        REFERENCES equipment(equipment_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    INDEX idx_maintenance_equipment (equipment_id),
    INDEX idx_maintenance_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================
-- VERIFY TABLE CREATION
-- ==========================================

SHOW TABLES;

DESCRIBE users;
DESCRIBE equipment;
DESCRIBE borrowings;
DESCRIBE reservations;
DESCRIBE maintenance;