# Student Management System

3 portals: **Admin**, **IT Department**, **AI & DS Department**
Backend: Node.js + Express + MySQL. Frontend: plain HTML/CSS/JS (no framework needed).

## Folder Structure
```
student-management/
├── backend/
│   ├── server.js        -> Express server + all API routes
│   ├── db.js             -> MySQL connection
│   ├── schema.sql        -> Run this to create the database & table
│   ├── .env.example       -> Copy to .env and fill your MySQL password
│   ├── uploads/           -> Student photos get saved here automatically
│   └── package.json
└── frontend/
    ├── index.html         -> Landing page (links to 3 portals)
    ├── admin/              -> Admin portal (add/edit/delete/view students)
    ├── it-department/      -> IT dept portal (read-only student list + profile)
    └── aids-department/    -> AI&DS dept portal (read-only student list + profile)
```

## Setup Steps (VS Code)

### 1. Install MySQL
Make sure MySQL Server is installed and running on your machine.

### 2. Create the database
Open terminal in VS Code and run:
```bash
mysql -u root -p < backend/schema.sql
```
This creates the `student_management` database with the `students` table.

### 3. Configure environment
```bash
cd backend
cp .env.example .env
```
Open `.env` and set your MySQL password:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_actual_mysql_password
DB_NAME=student_management
DB_PORT=3306
PORT=5000
```

### 4. Install dependencies
```bash
cd backend
npm install
```

### 5. Run the server
```bash
npm start
```
You should see: `Server running on http://localhost:5000`

### 6. Open the app
Open your browser and go to:
```
http://localhost:5000
```
This shows the landing page with 3 portal cards → Admin, IT Department, AI & DS Department.

## How it works (data flow)
1. Admin portal la "Add Student" la fill panni save panna → data MySQL `students` table la save aagum (department field = IT or AIDS).
2. IT Department portal automatically department = 'IT' students mattum fetch pannum.
3. AI & DS Department portal automatically department = 'AIDS' students mattum fetch pannum.
4. Admin edit/delete panna → same DB update aagum → department portal la kuda automatic ah update ah kaamikum (page refresh pannumbothu).
5. Photo upload → `backend/uploads/` folder la save aagi, DB la path store aagum.

## Notes
- Admin portal only has Add / Edit / Delete / Download buttons.
- IT & AI&DS portals are **view-only** — no edit/delete there (as requested).
- Download button on a student profile (Admin) opens the browser print dialog — "Save as PDF" pannikalam.
- If port 5000 already used pannirundha, `.env` la `PORT` value change pannikalam.
# STUDENT-DATABASE
