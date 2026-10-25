-- BorrowBox: table definitions and existing data only
-- Generated from the uploaded backup.sql

CREATE DATABASE IF NOT EXISTS `borrowbox`;
USE `borrowbox`;

CREATE TABLE `borrowings` (
  `borrowing_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `equipment_id` int NOT NULL,
  `borrow_date` date NOT NULL,
  `due_date` date NOT NULL,
  `return_date` date DEFAULT NULL,
  `status` enum('Borrowed','Returned','Overdue') DEFAULT 'Borrowed',
  PRIMARY KEY (`borrowing_id`),
  KEY `user_id` (`user_id`),
  KEY `equipment_id` (`equipment_id`),
  CONSTRAINT `borrowings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `borrowings_ibfk_2` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`equipment_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `equipment` (
  `equipment_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `category` varchar(50) NOT NULL,
  `description` text,
  `available_quantity` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`equipment_id`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `maintenance` (
  `maintenance_id` int NOT NULL AUTO_INCREMENT,
  `equipment_id` int NOT NULL,
  `issue_description` varchar(255) NOT NULL,
  `maintenance_date` date NOT NULL,
  `status` enum('Pending','In Progress','Completed') DEFAULT 'Pending',
  PRIMARY KEY (`maintenance_id`),
  KEY `equipment_id` (`equipment_id`),
  CONSTRAINT `maintenance_ibfk_1` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`equipment_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `reservations` (
  `reservation_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `equipment_id` int NOT NULL,
  `reservation_date` date NOT NULL,
  `status` enum('Pending','Approved','Cancelled') DEFAULT 'Pending',
  PRIMARY KEY (`reservation_id`),
  KEY `user_id` (`user_id`),
  KEY `equipment_id` (`equipment_id`),
  CONSTRAINT `reservations_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `reservations_ibfk_2` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`equipment_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `role` enum('Student','Staff','Admin') DEFAULT 'Student',
  `password_hash` varchar(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `borrowings` VALUES (6,1,20,'2026-10-20','2026-10-27','2026-10-20','Returned');

INSERT INTO `equipment` VALUES (1,'Laptop','Electronics','Laptop for student projects',6),(2,'Projector','Electronics','Projector for presentations',2),(3,'Digital Camera','Photography','Camera for college activities',3),(4,'Laptop Charger','Accessories','Universal laptop power adapter',10),(5,'External Hard Drive','Storage','External drive for data backups',6),(6,'USB Flash Drive','Storage','USB drive for file transfers',20),(7,'Power Bank','Accessories','Portable battery charger',8),(8,'HDMI Cable','Accessories','HDMI cable for display connections',12),(9,'Graphics Tablet','Electronics','Tablet for digital art and design',5),(10,'DSLR Camera','Photography','Digital camera for photography projects',3),(11,'Camera Lens','Photography','Additional lens for compatible cameras',4),(12,'Ring Light','Photography','LED ring light for video recording',6),(13,'Gimbal Stabilizer','Photography','Stabilizer for smooth video recording',3),(14,'Headphones','Audio','Over-ear headphones for audio work',10),(15,'Audio Mixer','Audio','Mixer for sound recording and events',2),(16,'Voice Recorder','Audio','Portable recorder for interviews',4),(17,'Laser Pointer','Presentation','Pointer for classroom presentations',8),(18,'Document Camera','Presentation','Camera for displaying documents',3),(19,'Whiteboard','Presentation','Portable whiteboard for group work',5),(20,'Scientific Calculator','Lab Equipment','Calculator for mathematical work',15),(21,'Digital Multimeter','Lab Equipment','Device for measuring electrical values',6),(22,'Soldering Iron','Lab Equipment','Tool for electronics prototyping',4),(23,'3D Printer','Lab Equipment','Printer for creating 3D prototypes',1);

INSERT INTO `maintenance` VALUES (1,2,'Projector needs inspection','2026-10-20','Completed'),(2,10,'jens cover craked and sensor filled withh dust','2026-10-20','Pending');

INSERT INTO `users` VALUES (1,'Shivasankar S','shivasankar.s.2025.csd@rajalakshmi.edu.in','Admin','$2b$12$GFCjbL19sUava4mhfwej1uMYvbiQ1LC53j9hblCHWR/yjy88HNUGm'),(2,'Kavin Parthibhan','kavinparthibhan@gmail.com','Admin',''),(4,'test Subject 1','test@borrowbox.in','Student','$2b$12$d8uzJq8r6IzNmWi0w1WnsOWvVErawzvWMJoaH2ZxKT.znzMlm0foW');
