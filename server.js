const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'tasks.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
    description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed')),
    due_date TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const statements = {
  getTask: db.prepare('SELECT * FROM tasks WHERE id = ?'),
  listTasks: null,
  insertTask: db.prepare(`
    INSERT INTO tasks (title, description, priority, status, due_date, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `),
  updateTask: db.prepare(`
    UPDATE tasks
    SET title = ?, description = ?, priority = ?, status = ?, due_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  toggleTask: db.prepare(`
    UPDATE tasks
    SET status = CASE WHEN status = 'completed' THEN 'pending' ELSE 'completed' END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  deleteTask: db.prepare('DELETE FROM tasks WHERE id = ?'),
  stats: db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN priority = 'high' AND status = 'pending' THEN 1 ELSE 0 END) AS high_pending
    FROM tasks
  `)
};

function setCommonHeaders(res, contentType = 'application/json; charset=utf-8') {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function sendJson(res, statusCode, payload) {
  setCommonHeaders(res);
  res.writeHead(statusCode);
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100 * 1024) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must contain valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function normalizeInput(body = {}) {
  return {
    title: typeof body.title === 'string' ? body.title.trim() : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    priority: typeof body.priority === 'string' ? body.priority.toLowerCase() : 'medium',
    status: typeof body.status === 'string' ? body.status.toLowerCase() : 'pending',
    due_date: body.due_date === '' || body.due_date == null ? null : body.due_date
  };
}

function validateTask(task) {
  const errors = {};
  if (!task.title) errors.title = 'Title is required.';
  else if (task.title.length > 120) errors.title = 'Title must be 120 characters or fewer.';
  if (task.description.length > 1000) errors.description = 'Description must be 1000 characters or fewer.';
  if (!['low', 'medium', 'high'].includes(task.priority)) errors.priority = 'Priority must be low, medium, or high.';
  if (!['pending', 'completed'].includes(task.status)) errors.status = 'Status must be pending or completed.';
  if (task.due_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(task.due_date)) {
    errors.due_date = 'Due date must use YYYY-MM-DD.';
  }
  return errors;
}

function rowToTask(row) {
  return row ? {
    id: Number(row.id),
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    due_date: row.due_date,
    created_at: row.created_at,
    updated_at: row.updated_at
  } : null;
}

function listTasks(url) {
  const where = [];
  const args = [];

  const status = url.searchParams.get('status') || 'all';
  const priority = url.searchParams.get('priority') || 'all';
  const search = (url.searchParams.get('search') || '').trim();

  if (['pending', 'completed'].includes(status)) {
    where.push('status = ?');
    args.push(status);
  }
  if (['low', 'medium', 'high'].includes(priority)) {
    where.push('priority = ?');
    args.push(priority);
  }
  if (search) {
    where.push('(title LIKE ? OR description LIKE ?)');
    args.push(`%${search}%`, `%${search}%`);
  }

  const sql = `
    SELECT * FROM tasks
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY status ASC,
             CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
             CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
             due_date ASC,
             created_at DESC
  `;
  return db.prepare(sql).all(...args).map(rowToTask);
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { success: true, message: 'Task API is running.' });
  }

  if (pathname === '/api/stats' && req.method === 'GET') {
    const row = statements.stats.get();
    return sendJson(res, 200, {
      success: true,
      stats: {
        total: Number(row.total || 0),
        completed: Number(row.completed || 0),
        pending: Number(row.pending || 0),
        high_pending: Number(row.high_pending || 0)
      }
    });
  }

  if (pathname === '/api/tasks' && req.method === 'GET') {
    return sendJson(res, 200, { success: true, tasks: listTasks(url) });
  }

  if (pathname === '/api/tasks' && req.method === 'POST') {
    const input = normalizeInput(await readJson(req));
    const errors = validateTask(input);
    if (Object.keys(errors).length) {
      return sendJson(res, 400, { success: false, message: 'Please fix the validation errors.', errors });
    }
    const result = statements.insertTask.run(input.title, input.description, input.priority, input.status, input.due_date);
    const task = rowToTask(statements.getTask.get(result.lastInsertRowid));
    return sendJson(res, 201, { success: true, task });
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/(\d+)(?:\/(complete))?$/);
  if (taskMatch) {
    const id = Number(taskMatch[1]);
    const action = taskMatch[2];
    const existingRow = statements.getTask.get(id);
    if (!existingRow) return sendJson(res, 404, { success: false, message: 'Task not found.' });

    if (req.method === 'GET' && !action) {
      return sendJson(res, 200, { success: true, task: rowToTask(existingRow) });
    }

    if (req.method === 'PATCH' && action === 'complete') {
      statements.toggleTask.run(id);
      return sendJson(res, 200, { success: true, task: rowToTask(statements.getTask.get(id)) });
    }

    if (req.method === 'PUT' && !action) {
      const body = await readJson(req);
      const input = normalizeInput(body);
      if (!input.title) input.title = existingRow.title;
      const errors = validateTask(input);
      if (Object.keys(errors).length) {
        return sendJson(res, 400, { success: false, message: 'Please fix the validation errors.', errors });
      }
      statements.updateTask.run(input.title, input.description, input.priority, input.status, input.due_date, id);
      return sendJson(res, 200, { success: true, task: rowToTask(statements.getTask.get(id)) });
    }

    if (req.method === 'DELETE' && !action) {
      statements.deleteTask.run(id);
      return sendJson(res, 200, { success: true, message: 'Task deleted successfully.' });
    }
  }

  return sendJson(res, 404, { success: false, message: 'API endpoint not found.' });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

function serveStatic(res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!safePath.startsWith(PUBLIC_DIR)) return sendJson(res, 400, { success: false, message: 'Invalid path.' });

  fs.readFile(safePath, (error, data) => {
    if (error) {
      if (pathname !== '/' && !path.extname(pathname)) return serveStatic(res, '/index.html');
      setCommonHeaders(res, 'text/plain; charset=utf-8');
      res.writeHead(404);
      return res.end('Not found');
    }
    const contentType = MIME_TYPES[path.extname(safePath).toLowerCase()] || 'application/octet-stream';
    setCommonHeaders(res, contentType);
    res.writeHead(200);
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(res, url.pathname);
    else sendJson(res, 405, { success: false, message: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, {
      success: false,
      message: error.statusCode ? error.message : 'Internal server error.'
    });
  }
});

server.listen(PORT, () => {
  console.log(`TaskFlow running at http://localhost:${PORT}`);
});

function shutdown() {
  try { db.close(); } finally { process.exit(0); }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
