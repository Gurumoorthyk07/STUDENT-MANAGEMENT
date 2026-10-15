const studentId = qs('id');
let currentStudent = null;

if (!studentId) {
  window.location.href = 'index.html';
}

function infoItem(label, value) {
  return `<div class="info-item"><div class="label">${label}</div><div class="value">${value || '-'}</div></div>`;
}

async function loadStudent() {
  try {
    currentStudent = await apiGet(`/students/${studentId}`);
    renderView(currentStudent);
    fillEditForm(currentStudent);

    if (qs('edit') === '1') enterEditMode();
  } catch (e) {
    showToast('Student not found', true);
    setTimeout(() => window.location.href = 'index.html', 1200);
  }
}

function renderView(s) {
  document.getElementById('viewName').textContent = s.name || '-';
  document.getElementById('viewMeta').textContent =
    `${s.department === 'AIDS' ? 'AI & DS' : s.department || '-'} · Reg No: ${s.register_number || '-'} · Year ${s.academic_year || '-'}`;

  const photoEl = document.getElementById('viewPhoto');
  const initialsEl = document.getElementById('viewInitials');
  if (s.photo) {
    const photoUrl = String(s.photo).trim();
    photoEl.src = /^https?:\/\//i.test(photoUrl) ? photoUrl : getPhotoUrl(photoUrl);
    photoEl.onclick = () => showPhotoPreview(photoEl.src, `${s.name || 'Student'} photo`);
    photoEl.classList.add('photo-preview-trigger');
    photoEl.onerror = () => {
      photoEl.style.display = 'none';
      photoEl.onclick = null;
      initialsEl.style.display = 'flex';
      initialsEl.textContent = getInitials(s.name);
    };
    photoEl.style.display = 'block';
    initialsEl.style.display = 'none';
  } else {
    photoEl.onclick = null;
    photoEl.classList.remove('photo-preview-trigger');
    photoEl.style.display = 'none';
    initialsEl.style.display = 'flex';
    initialsEl.textContent = getInitials(s.name);
  }

  document.getElementById('basicInfoGrid').innerHTML =
    infoItem('Gender', s.gender) +
    infoItem('Age', s.age) +
    infoItem('Date of Birth', formatDateOnly(s.date_of_birth)) +
    infoItem('Blood Group', s.blood_group) +
    infoItem('Mobile Number', s.mobile) +
    infoItem('Email', s.email);

  document.getElementById('parentInfoGrid').innerHTML =
    infoItem("Father's Name", s.father_name) +
    infoItem("Father's Occupation", s.father_occupation) +
    infoItem("Father's Mobile", s.father_mobile) +
    infoItem("Mother's Name", s.mother_name) +
    infoItem("Mother's Occupation", s.mother_occupation) +
    infoItem("Mother's Mobile", s.mother_mobile) +
    infoItem('Address', s.address);

  document.getElementById('schoolInfoGrid').innerHTML =
    infoItem('10th Board', s.board_10 || s['10th_board']) +
    infoItem('10th Marks', s.percentage_10) +
    infoItem('12th Board', s.board_12 || s['12th_board']) +
    infoItem('12th Marks', s.percentage_12);

  document.getElementById('collegeInfoGrid').innerHTML =
    infoItem('College Name', s.college_name) +
    infoItem('Department', s.department === 'AIDS' ? 'AI & DS' : s.department) +
    infoItem('Register Number', s.register_number) +
    infoItem('Academic Year', s.academic_year ? 'Year ' + s.academic_year : '-') +
    infoItem('Current CGPA', s.cgpa) +
    infoItem('Scholarship', s.scholarship) +
    infoItem('LinkedIn', s.linkedin ? `<a href="${s.linkedin}" target="_blank" style="color:var(--primary);">${s.linkedin}</a>` : '-');
}

function fillEditForm(s) {
  const form = document.getElementById('editForm');
  Object.keys(s).forEach(key => {
    const field = form.elements[key];
    if (field && field.type !== 'file') field.value = s[key] ?? '';
  });
}

function enterEditMode() {
  document.getElementById('viewMode').style.display = 'none';
  document.getElementById('editMode').style.display = 'block';
}
function exitEditMode() {
  document.getElementById('viewMode').style.display = 'block';
  document.getElementById('editMode').style.display = 'none';
}

document.getElementById('editBtn').addEventListener('click', enterEditMode);
document.getElementById('cancelEditBtn').addEventListener('click', exitEditMode);

document.getElementById('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  try {
    const res = await fetch(`${API_BASE}/students/${studentId}`, {
      method: 'PUT',
      body: formData
    });
    if (!res.ok) throw new Error();
    showToast('Student updated successfully');
    await loadStudent();
    exitEditMode();
  } catch (err) {
    showToast('Failed to update student', true);
  }
});

document.getElementById('deleteBtn').addEventListener('click', () => {
  confirmDelete(currentStudent.name, async () => {
    try {
      await apiDelete(`/students/${studentId}`);
      showToast('Student deleted');
      setTimeout(() => window.location.href = 'index.html', 700);
    } catch (e) {
      showToast('Failed to delete student', true);
    }
  });
});

document.getElementById('downloadBtn').addEventListener('click', () => {
  window.print();
});

loadStudent();
