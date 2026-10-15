const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const XLSX = require('xlsx');
const cloudinary = require('cloudinary').v2;
const db = require('./db');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// ------------ Middleware ------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  }
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------ Cloudinary Configuration ------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function uploadStudentPhoto(file) {
  if (!file) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      folder: 'student_profiles',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      resource_type: 'image'
    }, (error, response) => {
      if (error) return reject(error);
      if (!response?.secure_url) {
        return reject(new Error('Cloudinary did not return a secure URL for the student photo'));
      }
      resolve(response.secure_url);
    });

    stream.end(file.buffer);
  });
}

// Serve frontend (Admin / IT / AIDS portals)
const frontendDir = path.resolve(__dirname, '..', 'frontend');
app.get('/', (req, res) => res.redirect('/admin/index.html'));
app.use(express.static(frontendDir, { index: 'index.html' }));

const studentFields = [
  'name', 'gender', 'age', 'date_of_birth', 'blood_group', 'mobile', 'email', 'photo',
  'father_name', 'father_occupation', 'father_mobile',
  'mother_name', 'mother_occupation', 'mother_mobile', 'address',
  'board_10', 'percentage_10', 'board_12', 'percentage_12',
  'college_name', 'department', 'register_number', 'academic_year', 'cgpa', 'scholarship', 'linkedin'
];
const scholarshipCategories = ['First Graduate', 'PMSS', '7.5', 'Management', 'Others'];
const dynamicFieldName = 'imported_fields';
let studentTableColumns = new Map();
let studentPrimaryKey = null;
const studentColumnAliases = {
  name: ['full_name', 'student_name', 'name'],
  mobile: ['mobile', 'phone_number'],
  department: ['department', 'dept'],
  register_number: ['register_number', 'register_no', 'reg_no'],
  academic_year: ['academic_year', 'year_of_study']
};

async function loadStudentTableColumns() {
  const [columns] = await db.query('SHOW COLUMNS FROM students');
  studentTableColumns = new Map(columns.map(column => [String(column.Field).toLowerCase(), column.Field]));
  studentPrimaryKey = columns.find(column => column.Key === 'PRI')?.Field || null;
}

function getStudentColumn(field) {
  const candidates = studentColumnAliases[field] || [field];
  const found = candidates.find(column => studentTableColumns.has(column));
  return found ? studentTableColumns.get(found) : null;
}

function quoteStudentColumn(column) {
  if (!column || !/^[a-zA-Z0-9_]+$/.test(column)) {
    throw new Error(`Invalid students table column: ${column}`);
  }
  return `\`${column}\``;
}

function getStudentPrimaryKey() {
  if (!studentPrimaryKey) {
    throw new Error('The students table does not have a primary key');
  }
  return studentPrimaryKey;
}

function buildStudentSelectSql(whereClause = '') {
  return `SELECT * FROM students${whereClause}`;
}

function normalizeStudentRow(row) {
  const normalized = { ...row };
  for (const field of [...studentFields, dynamicFieldName]) {
    const column = getStudentColumn(field);
    if (column && column !== field && row[column] !== undefined) normalized[field] = row[column];
  }
  if (studentPrimaryKey && studentPrimaryKey !== 'id' && row[studentPrimaryKey] !== undefined) {
    normalized.id = row[studentPrimaryKey];
  }
  return normalized;
}

function normalizeStudentInput(student) {
  const normalized = { ...student };
  for (const [field, aliases] of Object.entries(studentColumnAliases)) {
    if (normalized[field] !== undefined) continue;
    const alias = aliases.find(candidate => student[candidate] !== undefined);
    if (alias) normalized[field] = student[alias];
  }
  return normalized;
}

function buildStudentInsert(student, upsert = false) {
  student = normalizeStudentInput(student);
  const fields = [...studentFields, dynamicFieldName];
  const entries = fields.flatMap(field => {
    const column = getStudentColumn(field);
    if (!column || !Object.prototype.hasOwnProperty.call(student, field)) return [];

    const value = student[field];
    return [[column, field === dynamicFieldName ? JSON.stringify(value || {}) : value === '' ? null : value]];
  });
  if (entries.length === 0) {
    throw new Error('No student fields in the request match columns in the students table');
  }

  const quotedColumns = entries.map(([column]) => quoteStudentColumn(column));
  let sql = `INSERT INTO students (${quotedColumns.join(', ')}) VALUES (${entries.map(() => '?').join(', ')})`;
  if (upsert) {
    const registerNumberColumn = getStudentColumn('register_number');
    const updateEntries = entries.filter(([column]) => column !== registerNumberColumn);
    const updates = updateEntries.length > 0
      ? updateEntries
      : [entries[0]];
    sql += ` ON DUPLICATE KEY UPDATE ${updates.map(([column]) => column === 'photo'
      ? `${quoteStudentColumn(column)}=COALESCE(NULLIF(VALUES(${quoteStudentColumn(column)}), ''),${quoteStudentColumn(column)})`
      : `${quoteStudentColumn(column)}=VALUES(${quoteStudentColumn(column)})`).join(', ')}`;
  }

  return { sql, values: entries.map(([, value]) => value) };
}

function buildStudentUpdate(student, id, photo) {
  student = normalizeStudentInput(student);
  const updates = [];
  for (const field of studentFields) {
    if (!Object.prototype.hasOwnProperty.call(student, field)) continue;
    const column = getStudentColumn(field);
    if (!column) continue;
    const value = student[field];
    updates.push([column, value === '' ? null : value]);
  }
  if (photo !== undefined) {
    const photoColumn = getStudentColumn('photo');
    if (photoColumn) updates.push([photoColumn, photo]);
  }
  if (updates.length === 0) {
    throw new Error('No supplied student fields match columns in the students table');
  }

  return {
    sql: `UPDATE students SET ${updates.map(([column]) => `${quoteStudentColumn(column)}=?`).join(', ')} WHERE ${quoteStudentColumn(getStudentPrimaryKey())}=?`,
    values: [...updates.map(([, value]) => value), id]
  };
}

function normalizeScholarship(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return scholarshipCategories.find(category => category.toLowerCase() === text.toLowerCase()) || null;
}

const normalizeHeader = (value) => String(value || '')
  .replace(/^\uFEFF/, '')
  .trim()
  .toLowerCase()
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const headerAliases = {
  name: ['name', 'full_name', 'student_name', 'student_full_name', 'student'],
  gender: ['gender', 'sex'],
  age: ['age', 'student_age'],
  register_number: [
    'register_number', 'reg_no', 'reg_num', 'register_no', 'registration_number',
    'registration_no', 'roll_no', 'roll_number'
  ],
  department: ['department', 'dept', 'branch', 'stream'],
  date_of_birth: ['date_of_birth', 'dob', 'birth_date', 'birthdate'],
  blood_group: ['blood_group', 'blood_type'],
  mobile: ['mobile', 'mobile_number', 'student_mobile', 'student_mobile_number', 'phone', 'phone_number', 'contact_number'],
  email: ['email', 'email_id', 'mail'],
  father_name: ['father_name', 'fathers_name', 'father_full_name', 'father'],
  father_occupation: ['father_occupation', 'fathers_occupation', 'father_job', 'father_profession'],
  father_mobile: ['father_mobile', 'fathers_mobile', 'father_phone', 'father_contact', 'father_mobile_number', 'fathers_mobile_number'],
  mother_name: ['mother_name', 'mothers_name', 'mother_full_name', 'mother'],
  mother_occupation: ['mother_occupation', 'mothers_occupation', 'mother_job', 'mother_profession'],
  mother_mobile: ['mother_mobile', 'mothers_mobile', 'mother_phone', 'mother_contact', 'mother_mobile_number', 'mothers_mobile_number'],
  address: ['address', 'home_address', 'residential_address'],
  college_name: ['college_name', 'college', 'institution'],
  board_10: [
    'board_10', 'board_10th', '10th_board', '10th_board_name', '10th_standard_board',
    'tenth_board', 'tenth_board_name', 'sslc_board', 'sslc'
  ],
  percentage_10: ['percentage_10', '10th_percentage', 'tenth_percentage', 'sslc_percentage', 'tenth_mark'],
  board_12: [
    'board_12', 'board_12th', '12th_board', '12th_board_name', '12th_standard_board',
    'twelfth_board', 'twelfth_board_name', 'hsc_board', 'hsc'
  ],
  percentage_12: ['percentage_12', '12th_percentage', 'twelfth_percentage', 'hsc_percentage', 'twelfth_mark'],
  academic_year: ['academic_year', 'year', 'study_year', 'year_of_study'],
  cgpa: ['cgpa', 'current_cgpa', 'gpa'],
  scholarship: ['scholarship', 'scholarship_type', 'scholarship_name'],
  linkedin: ['linkedin', 'linkedin_profile', 'linkedin_url'],
  photo: ['photo', 'photograph', 'profile_photo', 'profile_picture', 'student_profile_photo', 'photo_url', 'image', 'image_url']
};

studentFields.forEach(field => {
  headerAliases[field] = [...new Set([field, ...(headerAliases[field] || [])])];
});

const aliasLookup = Object.entries(headerAliases).reduce((lookup, [field, aliases]) => {
  aliases.forEach(alias => {
    lookup[normalizeHeader(alias).replace(/_/g, '')] = field;
  });
  return lookup;
}, {});

function canonicalFieldName(header) {
  const normalized = normalizeHeader(header);
  const compact = normalized.replace(/_/g, '');
  const exactField = aliasLookup[compact];
  if (exactField) return exactField;

  const has10th = compact.includes('10') || compact.includes('tenth') || compact.includes('sslc');
  const has12th = compact.includes('12') || compact.includes('twelfth') || compact.includes('hsc');
  const isPercentageOrMark = compact.includes('percentage') || compact.includes('percent') || compact.includes('mark');
  if ((compact.includes('board') || compact.includes('standard')) && has10th) return 'board_10';
  if ((compact.includes('board') || compact.includes('standard')) && has12th) return 'board_12';
  if (!isPercentageOrMark && has10th && (compact.includes('school') || compact.includes('exam') || compact === '10th' || compact === 'tenth')) {
    return 'board_10';
  }
  if (!isPercentageOrMark && has12th && (compact.includes('school') || compact.includes('exam') || compact === '12th' || compact === 'twelfth')) {
    return 'board_12';
  }

  if (compact.includes('father') && (compact.includes('mobile') || compact.includes('phone') || compact.includes('contact'))) return 'father_mobile';
  if (compact.includes('mother') && (compact.includes('mobile') || compact.includes('phone') || compact.includes('contact'))) return 'mother_mobile';
  if (compact.includes('father') && (compact.includes('occupation') || compact.includes('profession') || compact.includes('job'))) return 'father_occupation';
  if (compact.includes('mother') && (compact.includes('occupation') || compact.includes('profession') || compact.includes('job'))) return 'mother_occupation';
  if (compact.includes('father') && compact.includes('name')) return 'father_name';
  if (compact.includes('mother') && compact.includes('name')) return 'mother_name';
  if (compact.includes('college') || compact.includes('institution')) return 'college_name';
  if (compact.includes('department') || compact.includes('dept') || compact.includes('branch') || compact.includes('stream')) return 'department';
  if (compact.includes('reg') || compact.includes('registration') || compact.includes('roll')) return 'register_number';
  if (compact.includes('mobile') || compact.includes('phone') || compact.includes('contact')) return 'mobile';
  if (compact.includes('email') || compact.includes('mail')) return 'email';
  if (compact.includes('address')) return 'address';
  if (compact.includes('linkedin')) return 'linkedin';
  if (compact.includes('cgpa') || compact === 'gpa') return 'cgpa';
  if (compact.includes('scholarship')) return 'scholarship';
  if (compact.includes('photo') || compact.includes('picture')) return 'photo';
  if (compact.includes('gender') || compact === 'sex') return 'gender';
  if (compact === 'age' || compact.includes('studentage')) return 'age';
  if (compact.includes('dob') || compact.includes('birth')) return 'date_of_birth';
  if (compact.includes('blood')) return 'blood_group';
  if (compact.includes('board') && (compact.includes('10') || compact.includes('tenth') || compact.includes('sslc'))) return 'board_10';
  if (compact.includes('board') && (compact.includes('12') || compact.includes('twelfth') || compact.includes('hsc'))) return 'board_12';
  if (compact.includes('percentage') || compact.includes('percent') || compact.includes('mark')) {
    if (compact.includes('10') || compact.includes('tenth') || compact.includes('sslc')) return 'percentage_10';
    if (compact.includes('12') || compact.includes('twelfth') || compact.includes('hsc')) return 'percentage_12';
  }
  if (compact.includes('academic') || compact.includes('studyyear')) return 'academic_year';
  if (compact.includes('name')) return 'name';

  return normalized;
}

function normalizeImportedStudentRow(row) {
  const normalized = {};
  const importedFields = {};
  Object.entries(row).forEach(([key, value]) => {
    const field = canonicalFieldName(key);
    const rawValue = value instanceof Date && !Number.isNaN(value.getTime())
      ? normalizeDateValue(value)
      : String(value ?? '').trim();
    importedFields[String(key).trim() || field] = rawValue;
    if (studentFields.includes(field)) normalized[field] = normalizeImportValue(field, rawValue);
  });
  normalized[dynamicFieldName] = importedFields;
  return normalized;
}

function exposeBoardAliases(student) {
  let importedFields = student[dynamicFieldName];
  if (typeof importedFields === 'string') {
    try { importedFields = JSON.parse(importedFields); } catch { importedFields = {}; }
  }
  const importedBoardValue = (standard) => Object.entries(importedFields || {}).find(([header, value]) => {
    const compactHeader = normalizeHeader(header).replace(/_/g, '');
    const isStandard = standard === 10
      ? compactHeader.includes('10') || compactHeader.includes('tenth') || compactHeader.includes('sslc')
      : compactHeader.includes('12') || compactHeader.includes('twelfth') || compactHeader.includes('hsc');
    return isStandard && compactHeader.includes('board') && String(value || '').trim();
  })?.[1] || '';

  const board10 = student.board_10 || importedBoardValue(10);
  const board12 = student.board_12 || importedBoardValue(12);
  return {
    ...student,
    board_10: board10,
    board_12: board12,
    '10th_board': board10,
    '12th_board': board12
  };
}

function normalizeDateValue(value) {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const text = String(value).trim();
  if (!text) return '';
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dmyMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return text;
}

function normalizePercentageValue(value) {
  return String(value ?? '').trim().slice(0, 50);
}

function normalizeBloodGroupValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  let cleaned = text.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9+/-]/g, '');
  cleaned = cleaned.replace(/POSITIVE|POS/gi, '+').replace(/NEGATIVE|NEG/gi, '-').replace(/VE/gi, '').replace(/\++/g, '+').replace(/-+/g, '-');
  const match = cleaned.match(/^(A|B|AB|O)(\+|-)?$/);
  if (match) return match[1] + (match[2] || '');
  return cleaned.slice(0, 5);
}

function normalizeImportValue(field, value) {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  if (field === 'date_of_birth') return normalizeDateValue(text);
  if (field === 'blood_group') return normalizeBloodGroupValue(text);
  if (['percentage_10', 'percentage_12'].includes(field)) return normalizePercentageValue(text);
  if (field === 'academic_year') {
    const year = text.match(/(?:^|\D)([1-4])(?:\D|$)/);
    return year ? year[1] : text;
  }
  return text;
}

function normalizeDepartment(value) {
  const department = String(value || '').toUpperCase().replace(/[\s&_-]+/g, '');
  if (['AIDS', 'AIANDDS', 'AIANDS', 'AIDSDEPARTMENT', 'AIANDDSDEPARTMENT', 'AIANDDATASCIENCE'].includes(department)) return 'AIDS';
  if (['IT', 'ITDEPARTMENT', 'INFORMATIONTECHNOLOGY'].includes(department)) return 'IT';
  return department;
}

function parseBulkFile(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  if (extension === '.json') {
    const parsed = JSON.parse(file.buffer.toString('utf8'));
    return Array.isArray(parsed) ? parsed : parsed.students;
  }
  const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
}

function validateBulkRows(rows) {
  const errors = [];
  const registerNumbers = new Set();
  const students = rows.map(normalizeImportedStudentRow).filter(row => Object.values(row).some(Boolean));

  students.forEach((student, index) => {
    const rowNumber = index + 2;
    if (!student.name) errors.push(`Row ${rowNumber}: name is required`);
    if (!student.register_number) errors.push(`Row ${rowNumber}: register_number is required`);
    const department = normalizeDepartment(student.department);
    if (!['IT', 'AIDS'].includes(department)) {
      errors.push(`Row ${rowNumber}: department must be IT or AIDS`);
    } else {
      student.department = department === 'AIDS' ? 'AIDS' : 'IT';
    }
    const scholarship = normalizeScholarship(student.scholarship);
    if (scholarship === null) {
      errors.push(`Row ${rowNumber}: scholarship must be valid`);
    } else {
      student.scholarship = scholarship;
    }
  });
  return { errors, students };
}

// ============================================
//                STUDENT ROUTES
// ============================================

app.get('/api/students', async (req, res) => {
  try {
    const { department } = req.query;
    const params = [];
    let whereClause = '';
    if (department) {
      const departmentColumn = getStudentColumn('department');
      whereClause = ` WHERE ${quoteStudentColumn(departmentColumn)} = ?`;
      params.push(department);
    }
    const sql = buildStudentSelectSql(whereClause);
    const [rows] = await db.query(sql, params);
    res.json(rows.map(row => exposeBoardAliases(normalizeStudentRow(row))));
  } catch (err) {
    console.error('Failed to fetch students:', err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

app.get('/api/students/:id', async (req, res) => {
  try {
    const primaryKey = getStudentPrimaryKey();
    const sql = buildStudentSelectSql(` WHERE ${quoteStudentColumn(primaryKey)} = ?`);
    const [rows] = await db.query(sql, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Student not found' });
    res.json(exposeBoardAliases(normalizeStudentRow(rows[0])));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch student' });
  }
});

// POST add new student (Cloudinary URL saved directly!)
app.post('/api/students', upload.single('photo'), async (req, res) => {
  try {
    const b = req.body;
    const scholarship = normalizeScholarship(b.scholarship);
    if (scholarship === null) {
      return res.status(400).json({ error: `Scholarship must be valid` });
    }
    
    const photo = await uploadStudentPhoto(req.file);

    const student = {
      ...b,
      name: b.name ?? b.full_name,
      date_of_birth: b.date_of_birth || null,
      photo,
      scholarship: scholarship || null
    };
    const { sql, values } = buildStudentInsert(student);
    const [result] = await db.query(sql, values);
    res.status(201).json({ message: 'Student added successfully', id: result.insertId });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Register number already exists' });
    }
    res.status(500).json({ error: 'Failed to add student' });
  }
});

// PUT update student (Cloudinary URL support)
app.put('/api/students/:id', upload.single('photo'), async (req, res) => {
  try {
    const b = req.body;
    const id = req.params.id;
    const scholarship = normalizeScholarship(b.scholarship);
    if (scholarship === null) {
      return res.status(400).json({ error: `Scholarship must be valid` });
    }

    const photo = req.file ? await uploadStudentPhoto(req.file) : undefined;
    const student = {
      ...b,
      name: b.name ?? b.full_name,
      date_of_birth: b.date_of_birth || null,
      academic_year: b.academic_year || null,
      scholarship: scholarship || null
    };
    const { sql, values } = buildStudentUpdate(
      student,
      id,
      photo
    );
    await db.query(sql, values);
    res.json({ message: 'Student updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update student' });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  try {
    const primaryKey = getStudentPrimaryKey();
    const [students] = await db.query(
      `SELECT * FROM students WHERE ${quoteStudentColumn(primaryKey)} = ?`,
      [req.params.id]
    );
    if (students.length === 0) return res.status(404).json({ error: 'Student not found' });

    await db.query(
      `DELETE FROM students WHERE ${quoteStudentColumn(primaryKey)} = ?`,
      [req.params.id]
    );

    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const [[total]] = await db.query('SELECT COUNT(*) as count FROM students');
    const departmentColumn = getStudentColumn('department');
    const [byDept] = departmentColumn
      ? await db.query(`SELECT ${quoteStudentColumn(departmentColumn)} AS department, COUNT(*) as count FROM students GROUP BY ${quoteStudentColumn(departmentColumn)}`)
      : [[]];
    res.json({ total: total.count, byDepartment: byDept });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

async function startServer() {
  await loadStudentTableColumns();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});