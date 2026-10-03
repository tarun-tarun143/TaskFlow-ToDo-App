# TaskFlow — Professional Online To-Do & Task Management Application

A polished full-stack task management application for Task 2. It combines a responsive, animated SaaS-style frontend with a lightweight REST API and SQLite database.

## Highlights

- Create, update, delete, and complete tasks
- Priority levels: Low, Medium, High
- Optional due dates with overdue detection
- Search by task title or description
- Filter by status and priority
- Live task statistics and completion progress
- Animated completion feedback and task transitions
- Color-coded task priority accents
- Glassmorphism cards, gradients, ambient background effects, and responsive layout
- Light/dark theme toggle
- Client-side and server-side validation
- REST API + SQLite persistence
- Accessible labels, keyboard-friendly dialog, and reduced-motion support

## Requirements

Node.js 22.5+ is recommended because the backend uses Node's built-in `node:sqlite` module.

## Run

```bash
npm start
```

Open:

```text
http://localhost:3000
```

The SQLite database is created automatically inside `data/tasks.db` when the server starts.

## API

- `GET /api/health` — API health check
- `GET /api/stats` — task statistics
- `GET /api/tasks` — list tasks with `status`, `priority`, and `search` filters
- `GET /api/tasks/:id` — get one task
- `POST /api/tasks` — create a task
- `PUT /api/tasks/:id` — update a task
- `PATCH /api/tasks/:id/complete` — toggle completion
- `DELETE /api/tasks/:id` — delete a task

## Project structure

```text
TaskFlow/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/
├── package.json
├── server.js
└── README.md
```

## Assignment coverage

This project satisfies the Task 2 requirements for a full-stack To-Do and Task Management Application with a frontend, backend API, database storage, validation, error handling, API-based frontend/backend communication, and responsive task management UI.


## Usability Audit Fixes

This release addresses all 11 findings from the TaskFlow usability audit:

1. Consolidated typography into 7 shared font-size tokens.
2. Consolidated visible text colors into a shared accessible palette.
3. Consolidated corner radii into 6 design tokens.
4. Raised the PRODUCTIVITY SPACE eyebrow text to 12px.
5. Raised the footer text to 12px.
6. Moved the auto-save status into the task filter toolbar.
7. Replaced the ambiguous Focus Score sparkle with a standard information control and accessible label.
8. Reduced hero footprint and added a functional CTA to rebalance information density.
9. Added a direct “Clear all filters” recovery action in the empty state.
10. Made “Create a task” use the same primary button treatment as the header CTA.
11. Added “Add a task” directly inside the hero banner.


### Typography
Libre Caslon Condensed is loaded from Google Fonts and used for display headings and key numerical highlights, while the existing UI font remains for body copy and controls for readability.
