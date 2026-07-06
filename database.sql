-- WorkLog Database Setup
-- Jalankan file ini di phpMyAdmin atau MySQL CLI

CREATE DATABASE IF NOT EXISTS worklog_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE worklog_db;

-- Tabel Users
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabel Aktivitas
CREATE TABLE IF NOT EXISTS aktivitas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  judul VARCHAR(200) NOT NULL,
  deskripsi TEXT,
  tanggal DATE NOT NULL,
  waktu_mulai TIME NOT NULL,
  waktu_berakhir TIME NOT NULL,
  status ENUM('In Progres', 'Selesai', 'Dibatalkan') DEFAULT 'In Progres',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index untuk performa
CREATE INDEX idx_aktivitas_user_id ON aktivitas(user_id);
CREATE INDEX idx_aktivitas_tanggal ON aktivitas(tanggal);

-- Data contoh (opsional)
-- Password: password123 (bcrypt hash)
INSERT INTO users (nama, email, password) VALUES 
('Ali', 'ali20394@gmail.com', '12345');
