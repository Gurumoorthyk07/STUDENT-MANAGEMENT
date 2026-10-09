  -- ============================================
  -- Student Management System - Database Schema
  -- Run this file first in MySQL:
  --   mysql -u root -p < schema.sql
  -- ============================================

  CREATE DATABASE IF NOT EXISTS student_management;
  USE student_management;

  CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,

    -- Basic Info
    name VARCHAR(100) NOT NULL,
    gender VARCHAR(10),
    age INT,
    date_of_birth DATE,
    blood_group VARCHAR(10),
    mobile VARCHAR(15),
    email VARCHAR(100),
    photo VARCHAR(255),

    -- Father Details
    father_name VARCHAR(100),
    father_occupation VARCHAR(100),
    father_mobile VARCHAR(15),

    -- Mother Details
    mother_name VARCHAR(100),
    mother_occupation VARCHAR(100),
    mother_mobile VARCHAR(15),

    -- Address
    address TEXT,

    -- 10th Standard
    board_10 VARCHAR(100),
    percentage_10 VARCHAR(50),

    -- 12th StandardA
    board_12 VARCHAR(100),
    percentage_12 VARCHAR(50),

    -- College Details
    college_name VARCHAR(255),
    department VARCHAR(20),        -- 'IT' or 'AIDS'
    register_number VARCHAR(50) UNIQUE,
    academic_year INT,              -- 1 to 4
    cgpa VARCHAR(50),
    scholarship VARCHAR(100),       -- First Graduate, PMSS, 7.5, Management, Others
    linkedin VARCHAR(255),
    imported_fields JSON,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );