const API_BASE = `${window.location.origin}/api`;

function showToast(message, isError = false) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

function getPhotoUrl(photo) {
  if (!photo) return '';
  const photoValue = String(photo).trim();
  if (/^https?:\/\/drive\.google\.com\/open\?id=/i.test(photoValue)) {
    const id = new URL(photoValue).searchParams.get('id');
    return id ? `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}` : photoValue;
  }
  const driveFileMatch = photoValue.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveFileMatch) return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(driveFileMatch[1])}`;
  if (/^https?:\/\//i.test(photoValue)) return photoValue;
  const backendBase = API_BASE.replace(/\/api$/, '');
  return backendBase + (photoValue.startsWith('/') ? photoValue : '/' + photoValue);
}

function showPhotoPreview(src, alt = 'Student photo') {
  let modal = document.getElementById('photoPreviewModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'photoPreviewModal';
    modal.className = 'photo-preview-modal';
    modal.innerHTML = `
      <button class="photo-preview-close" type="button" aria-label="Close photo preview">&times;</button>
      <img class="photo-preview-image" alt="">`;
    document.body.appendChild(modal);
    const close = () => modal.classList.remove('show');
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
    });
    modal.querySelector('.photo-preview-close').addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
  }

  const image = modal.querySelector('.photo-preview-image');
  image.src = src;
  image.alt = alt;
  modal.classList.add('show');
}

function formatDateOnly(value) {
  if (!value) return '';

  const datePart = String(value).trim().split(/[T ]/, 1)[0];

  const isoMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;

  const dmyMatch = datePart.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
  }

  const ymdMatch = datePart.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
  }

  return datePart;
}

function sortStudents(students, order) {
  const sorted = [...students];
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  sorted.sort((first, second) => {
    const firstValue = order.startsWith('name') ? first.name || '' : first.register_number || '';
    const secondValue = order.startsWith('name') ? second.name || '' : second.register_number || '';
    const comparison = collator.compare(firstValue, secondValue);
    return order.endsWith('desc') ? -comparison : comparison;
  });

  return sorted;
}

function qs(param) {
  return new URLSearchParams(window.location.search).get(param);
}

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error('Request failed');
  return res.json();
}

async function apiGetStudents(query = '') {
  const students = await apiGet(`/students${query}`);
  if (!Array.isArray(students)) {
    throw new Error('Expected the students API to return an array');
  }

  return students.map(student => ({
    ...student,
    id: student.id ?? student.student_id,
    name: student.name ?? student.full_name ?? student.student_name,
    register_number: student.register_number ?? student.register_no ?? student.reg_no,
    department: student.department ?? student.dept,
    academic_year: student.academic_year ?? student.year_of_study,
    mobile: student.mobile ?? student.phone_number
  }));
}

async function apiDelete(path) {
  const res = await fetch(API_BASE + path, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
  return res.json();
}

// Reusable delete-confirm modal
function confirmDelete(name, onConfirm) {
  let overlay = document.getElementById('deleteModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'deleteModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <h4>Delete Student?</h4>
        <p id="deleteModalText">This action cannot be undone.</p>
        <div class="modal-actions">
          <button class="btn btn-outline hover-scale" id="cancelDeleteBtn">Cancel</button>
          <button class="btn btn-danger hover-scale" id="confirmDeleteBtn">Delete</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.classList.remove('show');
    });
  }
  document.getElementById('deleteModalText').textContent = `"${name}" oda details permanent ah delete aagum.`;
  // Retrigger enter animation
  overlay.classList.remove('show');
  void overlay.offsetWidth;
  overlay.classList.add('show');

  const cancelBtn = document.getElementById('cancelDeleteBtn');
  const confirmBtn = document.getElementById('confirmDeleteBtn');

  const close = () => overlay.classList.remove('show');
  cancelBtn.onclick = close;
  confirmBtn.onclick = () => { close(); onConfirm(); };
}
