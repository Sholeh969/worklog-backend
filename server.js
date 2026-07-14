const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Konfigurasi database
const dbConfig = process.env.MYSQL_URL ? {
  uri: process.env.MYSQL_URL,
} : {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'worklog_db',
};

const pool = process.env.MYSQL_URL 
  ? mysql.createPool(process.env.MYSQL_URL)
  : mysql.createPool(dbConfig);
const JWT_SECRET = process.env.JWT_SECRET || 'worklog_secret_key_2024';

// Buat koneksi pool
const pool = mysql.createPool(dbConfig);

// Middleware autentikasi
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token tidak ditemukan' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Token tidak valid' });
  }
};

// =====================
// AUTH ROUTES
// =====================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nama, email, password } = req.body;
    if (!nama || !email || !password)
      return res.status(400).json({ message: 'Semua field harus diisi' });

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0)
      return res.status(400).json({ message: 'Email sudah terdaftar' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (nama, email, password) VALUES (?, ?, ?)',
      [nama, email, hashedPassword]
    );

    const token = jwt.sign({ id: result.insertId, email, nama }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: 'Registrasi berhasil', token, user: { id: result.insertId, nama, email } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email dan password harus diisi' });

    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0)
      return res.status(400).json({ message: 'Email atau password salah' });

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: 'Email atau password salah' });

    const token = jwt.sign(
      { id: user.id, email: user.email, nama: user.nama },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ message: 'Login berhasil', token, user: { id: user.id, nama: user.nama, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// =====================
// PROFILE ROUTES
// =====================

// Get profil
app.get('/api/profil', authMiddleware, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, nama, email, created_at FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) return res.status(404).json({ message: 'User tidak ditemukan' });

    // Hitung statistik
    const [stats] = await pool.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Selesai' THEN 1 ELSE 0 END) as selesai
       FROM aktivitas WHERE user_id = ?`,
      [req.user.id]
    );

    const total = stats[0].total || 0;
    const selesai = stats[0].selesai || 0;
    const progress = total > 0 ? Math.round((selesai / total) * 100) : 0;

    res.json({ ...users[0], total_aktivitas: total, selesai, progress });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Update profil
app.put('/api/profil', authMiddleware, async (req, res) => {
  try {
    const { nama, email } = req.body;
    await pool.query('UPDATE users SET nama = ?, email = ? WHERE id = ?', [nama, email, req.user.id]);
    res.json({ message: 'Profil berhasil diupdate' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Ubah password
app.put('/api/profil/password', authMiddleware, async (req, res) => {
  try {
    const { password_lama, password_baru } = req.body;
    const [users] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    const isMatch = await bcrypt.compare(password_lama, users[0].password);
    if (!isMatch) return res.status(400).json({ message: 'Password lama salah' });

    const hashed = await bcrypt.hash(password_baru, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
    res.json({ message: 'Password berhasil diubah' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// =====================
// AKTIVITAS ROUTES
// =====================

// Get semua aktivitas (dengan filter)
app.get('/api/aktivitas', authMiddleware, async (req, res) => {
  try {
    const { filter, tanggal } = req.query;
    let query = 'SELECT * FROM aktivitas WHERE user_id = ?';
    const params = [req.user.id];

    const today = new Date().toISOString().split('T')[0];
    
    if (filter === 'hari_ini') {
      query += ' AND tanggal = ?';
      params.push(today);
    } else if (filter === 'minggu_ini') {
      query += ' AND YEARWEEK(tanggal, 1) = YEARWEEK(CURDATE(), 1)';
    } else if (filter === 'bulan_ini') {
      query += ' AND MONTH(tanggal) = MONTH(CURDATE()) AND YEAR(tanggal) = YEAR(CURDATE())';
    } else if (tanggal) {
      query += ' AND tanggal = ?';
      params.push(tanggal);
    }

    query += ' ORDER BY tanggal DESC, waktu_mulai ASC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get aktivitas hari ini untuk home
app.get('/api/aktivitas/hari-ini', authMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [rows] = await pool.query(
      'SELECT * FROM aktivitas WHERE user_id = ? AND tanggal = ? ORDER BY waktu_mulai ASC',
      [req.user.id, today]
    );

    const total = rows.length;
    const selesai = rows.filter(r => r.status === 'Selesai').length;
    const progress = total > 0 ? Math.round((selesai / total) * 100) : 0;

    res.json({ aktivitas: rows, ringkasan: { total, selesai, progress } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Tambah aktivitas
app.post('/api/aktivitas', authMiddleware, async (req, res) => {
  try {
    const { judul, deskripsi, tanggal, waktu_mulai, waktu_berakhir } = req.body;
    if (!judul || !tanggal || !waktu_mulai || !waktu_berakhir)
      return res.status(400).json({ message: 'Field wajib tidak boleh kosong' });

    const [result] = await pool.query(
      'INSERT INTO aktivitas (user_id, judul, deskripsi, tanggal, waktu_mulai, waktu_berakhir) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, judul, deskripsi || '', tanggal, waktu_mulai, waktu_berakhir]
    );
    res.status(201).json({ message: 'Aktivitas berhasil ditambahkan', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Update aktivitas
app.put('/api/aktivitas/:id', authMiddleware, async (req, res) => {
  try {
    const { judul, deskripsi, tanggal, waktu_mulai, waktu_berakhir, status } = req.body;
    await pool.query(
      'UPDATE aktivitas SET judul=?, deskripsi=?, tanggal=?, waktu_mulai=?, waktu_berakhir=?, status=? WHERE id=? AND user_id=?',
      [judul, deskripsi, tanggal, waktu_mulai, waktu_berakhir, status, req.params.id, req.user.id]
    );
    res.json({ message: 'Aktivitas berhasil diupdate' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Update status saja
app.patch('/api/aktivitas/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    await pool.query(
      'UPDATE aktivitas SET status=? WHERE id=? AND user_id=?',
      [status, req.params.id, req.user.id]
    );
    res.json({ message: 'Status berhasil diupdate' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Hapus aktivitas
app.delete('/api/aktivitas/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM aktivitas WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ message: 'Aktivitas berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`WorkLog API berjalan di port ${PORT}`));
