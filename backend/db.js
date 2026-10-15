const mysql = require('mysql2');
const path = require('path');
const fs = require('fs');

// Direct-ah TiDB cloud credentials-a configure panrom (Render error varatha irukka)
const pool = mysql.createPool({
  host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
  user: '3whZrkV31XBoSEb.root',
  password: 'R1EY5J7TzAKnF4Mo',
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