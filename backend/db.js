const mysql = require('mysql2');
const path = require('path');
const fs = require('fs');

const pool = mysql.createPool({
  host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
  user: '3whZRkV31XBoSEb.root', // e.g. 3whZrkV31XBoSEb.root
  password: 'YRhfMIWrWOHinC6U',
  database: 'student_management001',
  port: 4000,
  ssl: {
    rejectUnauthorized: false
  },
  dateStrings: ['DATE'],
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool.promise();