let allStudents = [];
let currentOrder = 'name-asc';
let currentYear = 'all';

async function loadStudents() {
  try {
    allStudents = await apiGet('/students?department=IT');
    document.getElementById('itTotal').textContent = allStudents.length;
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
    tr.onclick = () => { window.location.href = `profile.html?id=${s.id}`; };

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
      <td>${s.register_number || '-'}</td>
      <td>${s.academic_year ? 'Year ' + s.academic_year : '-'}</td>
      <td>${s.cgpa || '-'}</td>
      <td>${s.mobile || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderFilteredStudents() {
  const term = document.getElementById('searchInput').value.toLowerCase();
  const filtered = allStudents.filter(s => {
    const matchesSearch =
    (s.name || '').toLowerCase().includes(term) ||
    (s.register_number || '').toLowerCase().includes(term);
    const matchesYear = currentYear === 'all' || String(s.academic_year) === currentYear;
    return matchesSearch && matchesYear;
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

loadStudents();
