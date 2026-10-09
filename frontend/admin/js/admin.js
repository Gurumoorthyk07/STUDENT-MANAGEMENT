let allStudents = [];
let currentOrder = 'name-asc';
let currentYear = 'all';
let currentDepartment = 'all';

async function loadStats() {
  try {
    const stats = await apiGet('/stats');
    document.getElementById('totalCount').textContent = stats.total;
    const it = stats.byDepartment.find(d => d.department === 'IT');
    const aids = stats.byDepartment.find(d => d.department === 'AIDS');
    document.getElementById('itCount').textContent = it ? it.count : 0;
    document.getElementById('aidsCount').textContent = aids ? aids.count : 0;
  } catch (e) {
    console.error(e);
  }
}

async function loadStudents() {
  try {
    allStudents = await apiGet('/students');
    renderTable(sortStudents(allStudents, currentOrder));
  } catch (e) {
    showToast('Failed to load students', true);
  }
}

function renderTable(list) {
  const tbody = document.getElementById('studentTableBody');
  const emptyState = document.getElementById('emptyState');
  tbody.innerHTML = '';

  if (list.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  list.forEach((s, index) => {
    const tr = document.createElement('tr');
    tr.style.animationDelay = `${Math.min(index, 12) * 40}ms`;
    tr.onclick = (e) => {
      if (e.target.closest('.actions-cell')) return;
      window.location.href = `student.html?id=${s.id}`;
    };

    const photoHtml = s.photo
      ? `<img src="${getPhotoUrl(s.photo)}" class="avatar" />`
      : `<div class="avatar">${getInitials(s.name)}</div>`;

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>
        <div class="student-cell">
          ${photoHtml}
          <div>
            <div style="font-weight:600;">${s.name || '-'}</div>
            <div style="font-size:12.5px;color:var(--text-muted);">${s.email || ''}</div>
          </div>
        </div>
      </td>
      <td><span class="dept-chip ${s.department}">${s.department === 'AIDS' ? 'AI & DS' : s.department}</span></td>
      <td>${s.register_number || '-'}</td>
      <td>${s.academic_year ? 'Year ' + s.academic_year : '-'}</td>
      <td>${s.mobile || '-'}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-outline btn-sm hover-scale" onclick="event.stopPropagation(); window.location.href='student.html?id=${s.id}&edit=1'">Edit</button>
          <button class="btn btn-danger btn-sm hover-scale" onclick="event.stopPropagation(); handleDelete(${s.id}, '${(s.name || '').replace(/'/g, "\\'")}')">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function handleDelete(id, name) {
  confirmDelete(name, async () => {
    try {
      await apiDelete(`/students/${id}`);
      showToast('Student deleted successfully');
      loadStats();
      loadStudents();
    } catch (e) {
      showToast('Failed to delete student', true);
    }
  });
}

function renderFilteredStudents() {
  const term = document.getElementById('searchInput').value.toLowerCase();
  const filtered = allStudents.filter(s => {
    const matchesSearch =
    (s.name || '').toLowerCase().includes(term) ||
    (s.register_number || '').toLowerCase().includes(term) ||
    (s.department || '').toLowerCase().includes(term);
    const matchesYear = currentYear === 'all' || String(s.academic_year) === currentYear;
    const matchesDepartment = currentDepartment === 'all' || String(s.department) === currentDepartment;
    return matchesSearch && matchesYear && matchesDepartment;
  });
  renderTable(sortStudents(filtered, currentOrder));
}

document.getElementById('searchInput').addEventListener('input', () => {
  renderFilteredStudents();
});

document.getElementById('orderSelect').addEventListener('change', (e) => {
  currentOrder = e.target.value;
  renderFilteredStudents();
});

document.getElementById('yearSelect').addEventListener('change', (e) => {
  currentYear = e.target.value;
  renderFilteredStudents();
});

document.getElementById('departmentSelect').addEventListener('change', (e) => {
  currentDepartment = e.target.value;
  renderFilteredStudents();
});

loadStats();
loadStudents();
