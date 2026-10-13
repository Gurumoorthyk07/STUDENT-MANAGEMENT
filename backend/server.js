const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const XLSX = require('xlsx');
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

// Serve uploaded photos
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));

// Serve frontend (Admin / IT / AIDS portals)
const frontendDir = path.resolve(__dirname, '..', 'frontend');
app.use(express.static(frontendDir, { index: 'index.html' }));

// ------------ Multer (photo upload) ------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });
const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

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
      ? `${quoteStudentColumn(column)}=COALESCE(NULLIF(VALUES(${quoteStudentColumn(column)}), ''), ${quoteStudentColumn(column)})`
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

  // Accept spreadsheet labels such as "10TH STD BOARD" and "12TH BOARD NAME".
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

  if (compact.includes('father') && (compact.includes('mobile') || compact.includes('phone') || compact.includes('contact'))) {
    return 'father_mobile';
  }
  if (compact.includes('mother') && (compact.includes('mobile') || compact.includes('phone') || compact.includes('contact'))) {
    return 'mother_mobile';
  }
  if (compact.includes('father') && (compact.includes('occupation') || compact.includes('profession') || compact.includes('job'))) {
    return 'father_occupation';
  }
  if (compact.includes('mother') && (compact.includes('occupation') || compact.includes('profession') || compact.includes('job'))) {
    return 'mother_occupation';
  }
  if (compact.includes('father') && compact.includes('name')) return 'father_name';
  if (compact.includes('mother') && compact.includes('name')) return 'mother_name';
  if (compact.includes('college') || compact.includes('institution')) return 'college_name';
  if (compact.includes('department') || compact.includes('dept') || compact.includes('branch') || compact.includes('stream')) {
    return 'department';
  }
  if (compact.includes('reg') || compact.includes('registration') || compact.includes('roll')) {
    return 'register_number';
  }
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

function normalizeStudentRow(row) {
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

  // Some spreadsheets use labels such as "10th Std" or "Board of 12th".
  // Resolve these from the raw headers before writing the canonical columns.
  Object.entries(importedFields).forEach(([header, value]) => {
    const compactHeader = normalizeHeader(header).replace(/_/g, '');
    if (!value || !compactHeader.includes('board')) return;
    if (compactHeader.includes('10') || compactHeader.includes('tenth') || compactHeader.includes('sslc')) {
      normalized.board_10 ||= value;
    }
    if (compactHeader.includes('12') || compactHeader.includes('twelfth') || compactHeader.includes('hsc')) {
      normalized.board_12 ||= value;
    }
  });
  normalized[dynamicFieldName] = importedFields;
  return normalized;
}

function exposeBoardAliases(student) {
  let importedFields = student[dynamicFieldName];
  if (typeof importedFields === 'string') {
    try {
      importedFields = JSON.parse(importedFields);
    } catch {
      importedFields = {};
    }
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

  const ymdMatch = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Keep unrecognised values unchanged; parsing them with Date can apply a timezone offset.
  return text;
}

function normalizePercentageValue(value) {
  const text = String(value ?? '').trim();
  return text.slice(0, 50);
}

function normalizeBloodGroupValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';

  let cleaned = text
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9+/-]/g, '');

  if (!cleaned) return '';

  cleaned = cleaned
    .replace(/POSITIVE|POS/gi, '+')
    .replace(/NEGATIVE|NEG/gi, '-')
    .replace(/VE/gi, '')
    .replace(/\++/g, '+')
    .replace(/-+/g, '-');

  const match = cleaned.match(/^(A|B|AB|O)(\+|-)?$/);
  if (match) return match[1] + (match[2] || '');

  const short = cleaned.match(/^(A|B|AB|O)/);
  if (short) {
    const base = short[1];
    if (cleaned.includes('+')) return `${base}+`;
    if (cleaned.includes('-')) return `${base}-`;
    return base;
  }

  return cleaned.slice(0, 5);
}

function normalizeImportValue(field, value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return field === 'date_of_birth' ? normalizeDateValue(value) : value.toISOString();
  }

  const text = String(value).trim();
  if (field === 'date_of_birth') return normalizeDateValue(text);
  if (field === 'blood_group') return normalizeBloodGroupValue(text);
  if (['percentage_10', 'percentage_12'].includes(field)) return normalizePercentageValue(text);
  if (field === 'photo') return normalizePhotoValue(text);
  if (field === 'academic_year') {
    const year = text.match(/(?:^|\D)([1-4])(?:\D|$)/);
    return year ? year[1] : text;
  }
  return text;
}

function normalizePhotoValue(value) {
  if (!value) return '';
  if (value.startsWith('data:image/')) return value;
  return value;
}

function extractGoogleDriveFileId(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/(?:id=|\/d\/|file\/d\/|\/uc\?id=)([a-zA-Z0-9_-]{25,})/);
  if (match && match[1]) return match[1];
  if (value.length > 20 && !value.includes('/')) return value.trim();
  return null;
}

async function downloadGoogleDrivePhoto(photoUrl) {
  try {
    const fileId = extractGoogleDriveFileId(photoUrl);
    if (!fileId) {
      console.log(`[PHOTO LOG] Invalid or missing File ID for URL: ${photoUrl}`);
      return null;
    }

    // Google CDN High-Speed Direct Image Endpoint
    const directUrl = `https://lh3.googleusercontent.com/d/${fileId}=s1000`;
    console.log(`[PHOTO LOG] Fetching image for File ID: ${fileId}...`);

    const fileName = `student-${Date.now()}-${crypto.randomUUID()}.jpg`;
    const outputPath = path.join(uploadsDir, fileName);

    const response = await axios.get(directUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    if (response.status === 200 && response.data.byteLength > 1000 && !contentType.includes('text/html')) {
      fs.writeFileSync(outputPath, response.data);
      console.log(`[PHOTO LOG] Saved image to: /uploads/${fileName}`);
      return `/uploads/${fileName}`;
    } else {
      console.warn(`[PHOTO LOG] Invalid response or missing image bytes for File ID: ${fileId}`);
      return null;
    }
  } catch (err) {
    console.error(`[PHOTO LOG] Error downloading drive image (${photoUrl}):`, err.message);
    return null;
  }
}

async function resolveImportedPhoto(student) {
  if (!student.photo || student.photo.startsWith('/uploads/') || student.photo.startsWith('data:image/')) {
    return student.photo || null;
  }

  return await downloadGoogleDrivePhoto(student.photo);
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
  const students = rows.map(normalizeStudentRow).filter(row => Object.values(row).some(Boolean));

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
      errors.push(`Row ${rowNumber}: scholarship must be one of ${scholarshipCategories.join(', ')}`);
    } else {
      student.scholarship = scholarship;
    }
    if (student.register_number) {
      if (registerNumbers.has(student.register_number)) {
        errors.push(`Row ${rowNumber}: duplicate register_number in file`);
      }
      registerNumbers.add(student.register_number);
    }
  });

  return { errors, students };
}

// ============================================
//                STUDENT ROUTES
// ============================================

// GET all students (optionally filter by department: ?department=IT)
app.get('/api/students', async (req, res) => {
  try {
    const { department } = req.query;
    const params = [];
    let whereClause = '';
    if (department) {
      const departmentColumn = getStudentColumn('department');
      if (!departmentColumn) {
        return res.status(400).json({ error: 'Department filtering is unavailable for this students table' });
      }
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

// GET single student by id
app.get('/api/students/:id', async (req, res) => {
  try {
    const primaryKey = getStudentPrimaryKey();
    const sql = buildStudentSelectSql(` WHERE ${quoteStudentColumn(primaryKey)} = ?`);
    const [rows] = await db.query(sql, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Student not found' });
    res.json(exposeBoardAliases(normalizeStudentRow(rows[0])));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch student' });
  }
});

// POST add new student (with photo upload)
app.post('/api/students', upload.single('photo'), async (req, res) => {
  try {
    const b = req.body;
    const scholarship = normalizeScholarship(b.scholarship);
    if (scholarship === null) {
      return res.status(400).json({ error: `Scholarship must be one of: ${scholarshipCategories.join(', ')}` });
    }
    const photo = req.file ? '/uploads/' + req.file.filename : null;

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

// POST bulk student import from CSV, Excel, or JSON
app.post('/api/students/bulk', bulkUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please select a CSV, Excel, or JSON file' });

  const downloadedPhotoPaths = [];
  try {
    const rows = parseBulkFile(req.file);
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'JSON must contain an array of students or a students array' });
    }

    const { errors, students } = validateBulkRows(rows);
    if (students.length === 0) errors.push('The file does not contain any student records');
    if (errors.length > 0) return res.status(400).json({ error: 'Import validation failed', details: errors });

    for (const student of students) {
      const localPhotoPath = await resolveImportedPhoto(student);
      if (localPhotoPath) {
        student.photo = localPhotoPath;
        downloadedPhotoPaths.push(localPhotoPath);
      }
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      for (const student of students) {
        const { sql, values } = buildStudentInsert(student, true);
        await connection.query(sql, values);
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Import failed: a register number already exists in the database' });
      }
      throw err;
    } finally {
      connection.release();
    }

    res.status(201).json({ message: 'Students imported successfully', imported: students.length });
  } catch (err) {
    await Promise.all(downloadedPhotoPaths.map(photo => {
      const photoPath = path.join(uploadsDir, path.basename(photo));
      return fs.promises.unlink(photoPath).catch(unlinkError => {
        if (unlinkError.code !== 'ENOENT') console.error(unlinkError);
      });
    }));
    console.error(err);
    res.status(400).json({
      error: 'Could not process the import file',
      details: [err.sqlMessage || err.message || 'Check the file format and column names.']
    });
  }
});

// PUT update student (with optional new photo)
app.put('/api/students/:id', upload.single('photo'), async (req, res) => {
  try {
    const b = req.body;
    const id = req.params.id;
    const scholarship = normalizeScholarship(b.scholarship);
    if (scholarship === null) {
      return res.status(400).json({ error: `Scholarship must be one of: ${scholarshipCategories.join(', ')}` });
    }

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
      req.file ? '/uploads/' + req.file.filename : undefined
    );
    await db.query(sql, values);
    res.json({ message: 'Student updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update student' });
  }
});

// DELETE student
app.delete('/api/students/:id', async (req, res) => {
  try {
    const primaryKey = getStudentPrimaryKey();
    const photoColumn = getStudentColumn('photo');
    const selectedColumns = [quoteStudentColumn(primaryKey)];
    if (photoColumn) selectedColumns.push(`${quoteStudentColumn(photoColumn)} AS photo`);
    const [students] = await db.query(
      `SELECT ${selectedColumns.join(', ')} FROM students WHERE ${quoteStudentColumn(primaryKey)} = ?`,
      [req.params.id]
    );
    if (students.length === 0) return res.status(404).json({ error: 'Student not found' });

    await db.query(
      `DELETE FROM students WHERE ${quoteStudentColumn(primaryKey)} = ?`,
      [req.params.id]
    );

    const photo = students[0].photo;
    if (photo && photo.startsWith('/uploads/')) {
      const photoPath = path.join(uploadsDir, path.basename(photo));
      await fs.promises.unlink(photoPath).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      });
    }

    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

// GET dashboard stats (total students, per department)
app.get('/api/stats', async (req, res) => {
  try {
    const [[total]] = await db.query('SELECT COUNT(*) as count FROM students');
    const departmentColumn = getStudentColumn('department');
    const [byDept] = departmentColumn
      ? await db.query(`SELECT ${quoteStudentColumn(departmentColumn)} AS department, COUNT(*) as count FROM students GROUP BY ${quoteStudentColumn(departmentColumn)}`)
      : [[]];
    res.json({ total: total.count, byDepartment: byDept });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

async function startServer() {
  try {
    await db.query('ALTER TABLE students ADD COLUMN date_of_birth DATE');
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  const columnAlterations = [
    'ALTER TABLE students MODIFY COLUMN blood_group VARCHAR(10)',
    'ALTER TABLE students MODIFY COLUMN board_10 VARCHAR(100)',
    'ALTER TABLE students MODIFY COLUMN percentage_10 VARCHAR(50)',
    'ALTER TABLE students MODIFY COLUMN board_12 VARCHAR(100)',
    'ALTER TABLE students MODIFY COLUMN percentage_12 VARCHAR(50)',
    'ALTER TABLE students MODIFY COLUMN cgpa VARCHAR(50)',
    'ALTER TABLE students MODIFY COLUMN scholarship VARCHAR(100)',
    'ALTER TABLE students MODIFY COLUMN college_name VARCHAR(255)',
    'ALTER TABLE students MODIFY COLUMN linkedin VARCHAR(255)',
    'ALTER TABLE students ADD COLUMN imported_fields JSON'
  ];

  for (const alterSql of columnAlterations) {
    try {
      await db.query(alterSql);
    } catch (err) {
      if (!['ER_BAD_FIELD_ERROR', 'ER_DUP_FIELDNAME'].includes(err.code)) {
        console.warn(`Column migration skipped: ${alterSql} -> ${err.code || err.message}`);
      }
    }
  }

  await loadStudentTableColumns();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});