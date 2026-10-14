const mysql = require('mysql2');
const path = require('path');
const fs = require('fs'); // 1. fs module-ai import pannunga
require('dotenv').config({ path: path.join(__dirname, '.env') });

const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(
  String(process.env.DB_HOST || '').toLowerCase()
);
const ssl = isLocalDatabase
  ? false
  : isProduction
    ? { rejectUnauthorized: false }
    : {
      ca: fs.readFileSync(path.join(__dirname, 'ca.pem')),
      rejectUnauthorized: true
    };

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.student_management001,
  port: process.env.DB_PORT,
  ssl,
  dateStrings: ['DATE'],
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool.promise();