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
The backend reads the `students` table columns at startup and limits manual and
bulk-import inserts to supplied fields supported by that table. The student
name column can be `full_name`, `student_name`, or `name`.

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
Local MySQL connections (`localhost`, `127.0.0.1`, or `::1`) use no TLS; configure
the actual MySQL password for `DB_PASSWORD` before starting the backend.

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

## Deploy to Render

Create a new Blueprint in Render using `render.yaml` at the repository root. The
Blueprint installs and starts the backend while keeping the repository root as
the service root, so Express can serve the `frontend/` directory.

Before deploying, provision a reachable MySQL database and load
`backend/schema.sql` into it. When prompted by the Blueprint, set `DB_HOST`,
`DB_USER`, `DB_PASSWORD`, and `DB_NAME` to that database's connection details.
`DB_PORT` defaults to `3306`; change it if the provider uses another port.
Render supplies `PORT` automatically, so do not set it manually.

Render's local filesystem is ephemeral. Student photos uploaded at runtime may
be lost on redeploy or restart; attach a persistent disk mounted at
`backend/uploads` (using the service's absolute mount path) if uploaded photos
must persist. Persistent disks require a paid Render service.
# STUDENT-DATABASE
# STUDENT-MANAGEMENT
