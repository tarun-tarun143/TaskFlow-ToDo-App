const state = {
  editingId: null,
  searchTimer: null,
  darkMode: true
};

const $ = (id) => document.getElementById(id);
const taskList = $('taskList');
const loading = $('loading');
const emptyState = $('emptyState');
const dialog = $('taskDialog');
const form = $('taskForm');
const toast = $('toast');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatDate(date) {
  if (!date) return 'No due date';
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(task) {
  if (!task.due_date || task.status === 'completed') return false;
  const today = new Date();
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return new Date(`${task.due_date}T00:00:00`) < localToday;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function celebrate() {
  const colors = ['#6d5dfc', '#9d73ff', '#4d9cff', '#23c58e', '#ff9e58', '#ef5c7a', '#ffd166'];
  const layer = $('confetti');
  layer.innerHTML = '';
  for (let i = 0; i < 34; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${50 + (Math.random() * 18 - 9)}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.setProperty('--x', `${(Math.random() * 420) - 210}px`);
    piece.style.setProperty('--y', `${150 + Math.random() * 390}px`);
    piece.style.animationDelay = `${Math.random() * .16}s`;
    layer.appendChild(piece);
  }
  setTimeout(() => { layer.innerHTML = ''; }, 1500);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Request failed.');
    error.payload = data;
    throw error;
  }
  return data;
}

function hasActiveFilters() {
  return Boolean($('searchInput').value.trim() || $('statusFilter').value !== 'all' || $('priorityFilter').value !== 'all');
}

function clearFilters() {
  $('searchInput').value = '';
  $('statusFilter').value = 'all';
  $('priorityFilter').value = 'all';
  loadTasks();
}

function currentFilters() {
  return new URLSearchParams({
    status: $('statusFilter').value,
    priority: $('priorityFilter').value,
    search: $('searchInput').value.trim()
  });
}

async function loadTasks() {
  loading.classList.remove('hidden');
  emptyState.classList.add('hidden');
  try {
    const data = await api(`/api/tasks?${currentFilters()}`);
    renderTasks(data.tasks);
  } catch (error) {
    taskList.innerHTML = `<div class="state-card"><strong>Unable to load tasks.</strong><p>${escapeHtml(error.message)}</p></div>`;
  } finally {
    loading.classList.add('hidden');
  }
}

async function loadStats() {
  try {
    const data = await api('/api/stats');
    const stats = data.stats;
    $('totalCount').textContent = stats.total;
    $('pendingCount').textContent = stats.pending;
    $('completedCount').textContent = stats.completed;
    $('highCount').textContent = stats.high_pending;
    $('focusCompleted').textContent = stats.completed;
    $('focusTotal').textContent = stats.total;

    const percent = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
    $('progressPercent').textContent = percent;
    $('progressBar').style.width = `${percent}%`;
    $('progressText').textContent = stats.total
      ? (percent === 100 ? 'Everything is complete. Enjoy the win.' : `${stats.pending} pending task${stats.pending === 1 ? '' : 's'} still in motion.`)
      : 'Create your first task to get started.';
  } catch (error) {
    console.error(error);
  }
}

function renderTasks(tasks) {
  taskList.innerHTML = '';
  $('visibleTaskCount').textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
  emptyState.classList.toggle('hidden', tasks.length !== 0);
  $('clearFiltersBtn').classList.toggle('hidden', !hasActiveFilters());
  if (!tasks.length) return;

  taskList.innerHTML = tasks.map((task, index) => `
    <article class="task-card priority-edge-${task.priority} ${task.status === 'completed' ? 'completed' : ''}" style="animation-delay:${Math.min(index * 45, 300)}ms">
      <button class="check-btn ${task.status === 'completed' ? 'done' : ''}" data-action="toggle" data-id="${task.id}" aria-label="${task.status === 'completed' ? 'Mark as pending' : 'Mark as completed'}">✓</button>
      <div>
        <div class="task-title-row">
          <h3>${escapeHtml(task.title)}</h3>
          <span class="badge priority-${task.priority}">${escapeHtml(task.priority)}</span>
        </div>
        ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ''}
        <div class="task-meta">
          <span class="${isOverdue(task) ? 'overdue' : ''}">◷ ${escapeHtml(formatDate(task.due_date))}${isOverdue(task) ? ' · Overdue' : ''}</span>
          <span>• Created ${escapeHtml(formatDate(task.created_at.slice(0, 10)))}</span>
        </div>
      </div>
      <div class="task-actions">
        <button data-action="edit" data-id="${task.id}" type="button">Edit</button>
        <button class="delete" data-action="delete" data-id="${task.id}" type="button">Delete</button>
      </div>
    </article>
  `).join('');
}

function resetForm() {
  form.reset();
  $('taskId').value = '';
  $('priorityInput').value = 'medium';
  clearErrors();
}

function clearErrors() {
  for (const id of ['title', 'description', 'priority', 'status', 'due_date']) {
    const element = $(`${id}Error`);
    if (element) element.textContent = '';
  }
}

function applyErrors(errors = {}) {
  clearErrors();
  for (const [field, message] of Object.entries(errors || {})) {
    const element = $(`${field}Error`);
    if (element) element.textContent = message;
  }
}

function openCreateDialog() {
  state.editingId = null;
  resetForm();
  $('dialogTitle').textContent = 'Create Task';
  $('saveBtn').innerHTML = 'Save Task <span>→</span>';
  dialog.showModal();
  requestAnimationFrame(() => $('titleInput').focus());
}

async function openEditDialog(id) {
  try {
    const data = await api(`/api/tasks/${id}`);
    const task = data.task;
    state.editingId = task.id;
    $('taskId').value = task.id;
    $('titleInput').value = task.title;
    $('descriptionInput').value = task.description;
    $('priorityInput').value = task.priority;
    $('dueDateInput').value = task.due_date || '';
    clearErrors();
    $('dialogTitle').textContent = 'Edit Task';
    $('saveBtn').innerHTML = 'Update Task <span>→</span>';
    dialog.showModal();
    requestAnimationFrame(() => $('titleInput').focus());
  } catch (error) {
    showToast(error.message);
  }
}

async function saveTask(event) {
  event.preventDefault();
  clearErrors();
  const payload = {
    title: $('titleInput').value.trim(),
    description: $('descriptionInput').value.trim(),
    priority: $('priorityInput').value,
    due_date: $('dueDateInput').value || null
  };

  if (!payload.title) {
    $('titleError').textContent = 'Title is required.';
    $('titleInput').focus();
    return;
  }
  if (payload.title.length > 120) {
    $('titleError').textContent = 'Title must be 120 characters or fewer.';
    return;
  }
  if (payload.description.length > 1000) {
    $('descriptionError').textContent = 'Description must be 1000 characters or fewer.';
    return;
  }

  const wasEditing = Boolean(state.editingId);
  $('saveBtn').disabled = true;
  $('saveBtn').innerHTML = wasEditing ? 'Updating…' : 'Saving…';
  try {
    const method = wasEditing ? 'PUT' : 'POST';
    const url = wasEditing ? `/api/tasks/${state.editingId}` : '/api/tasks';
    await api(url, { method, body: JSON.stringify(payload) });
    dialog.close();
    showToast(wasEditing ? 'Task updated successfully.' : 'Task created successfully.');
    await Promise.all([loadTasks(), loadStats()]);
  } catch (error) {
    applyErrors(error.payload?.errors);
    showToast(error.message);
  } finally {
    $('saveBtn').disabled = false;
    $('saveBtn').innerHTML = wasEditing ? 'Update Task <span>→</span>' : 'Save Task <span>→</span>';
  }
}

async function toggleTask(id) {
  try {
    const before = await api(`/api/tasks/${id}`);
    await api(`/api/tasks/${id}/complete`, { method: 'PATCH' });
    await Promise.all([loadTasks(), loadStats()]);
    if (before.task.status === 'pending') {
      showToast('Nice work — task completed!');
      celebrate();
    } else {
      showToast('Task moved back to pending.');
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteTask(id) {
  if (!window.confirm('Delete this task? This action cannot be undone.')) return;
  try {
    await api(`/api/tasks/${id}`, { method: 'DELETE' });
    showToast('Task deleted successfully.');
    await Promise.all([loadTasks(), loadStats()]);
  } catch (error) {
    showToast(error.message);
  }
}

function toggleTheme() {
  state.darkMode = !state.darkMode;
  document.body.classList.toggle('dark', state.darkMode);
  $('themeBtn').textContent = state.darkMode ? '☀' : '◐';
  localStorage.setItem('taskflow-theme', state.darkMode ? 'dark' : 'light');
}

function hydrateTheme() {
  state.darkMode = localStorage.getItem('taskflow-theme') !== 'light';
  document.body.classList.toggle('dark', state.darkMode);
  $('themeBtn').textContent = state.darkMode ? '☀' : '◐';
}

taskList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const id = Number(button.dataset.id);
  const action = button.dataset.action;
  if (action === 'toggle') toggleTask(id);
  if (action === 'edit') openEditDialog(id);
  if (action === 'delete') deleteTask(id);
});

$('newTaskBtn').addEventListener('click', openCreateDialog);
$('heroNewBtn').addEventListener('click', openCreateDialog);
$('focusInfoBtn').addEventListener('click', () => showToast('Focus Score = completed tasks divided by total tasks.'));
$('clearFiltersBtn').addEventListener('click', clearFilters);
$('emptyNewBtn').addEventListener('click', openCreateDialog);
$('themeBtn').addEventListener('click', toggleTheme);
$('closeDialogBtn').addEventListener('click', () => dialog.close());
$('cancelBtn').addEventListener('click', () => dialog.close());
form.addEventListener('submit', saveTask);
$('statusFilter').addEventListener('change', loadTasks);
$('priorityFilter').addEventListener('change', loadTasks);
$('searchInput').addEventListener('input', () => {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(loadTasks, 220);
});

dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

dialog.addEventListener('close', () => {
  resetForm();
  state.editingId = null;
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && dialog.open) dialog.close();
});

hydrateTheme();
Promise.all([loadTasks(), loadStats()]);
