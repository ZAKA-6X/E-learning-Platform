Teacher flow:

Offering (Class × Subject) → Courses → Folders → Resources

Offering = teacher’s assignment to a class and subject.

Course = a library of materials under one offering.

Folder = groups materials inside a course.

Resource = a file or link inside a folder.

📂 Project Structure:
Backend:
File	                             Purpose
backend/app.js	                    Express server, serves frontend, mounts /api.
routes/authRoutes.js	            Auth endpoints (login/signup).
middleware/authMiddleware.js	    JWT verification, teacher-only access.
routes/teacher.js	                Endpoints for filters, offerings, libraries, sections, items.
controllers/teacherController.js	Logic for filters, offerings, offering detail.
controllers/libraryController.js	CRUD for courses (libraries), folders (sections), resources (items).


Frontend:
File	                            Purpose
pages/teacher-dashboard.html	    Teacher UI layout (offerings grid + detail panel).
js/teacher-dashboard.js	            Boot, API calls, render courses, folders, resources.


🗄 Database Schema
------------Core Tables----------------

-- Courses (libraries)
course_libraries (
  id uuid PK,
  assignment_id bigint FK -> teacher_assignments(id),
  title text NOT NULL,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
)

-- Folders
library_sections (
  id uuid PK,
  library_id uuid FK -> course_libraries(id),
  title text NOT NULL,
  position int DEFAULT 1,
  created_at timestamptz DEFAULT now()
)

-- Resources
library_items (
  id uuid PK,
  section_id uuid FK -> library_sections(id),
  kind text CHECK (kind IN ('pdf','image','video','link','other')),
  name text NOT NULL,
  url text NOT NULL,
  position int DEFAULT 1,
  created_at timestamptz DEFAULT now()
)

-----------------Supporting Tables-------------

teacher_assignments → teacher ↔ class ↔ subject

classes → school classes

subjects → school subjects

users → teachers, students, admins

------------------------------------------------

🔌 API Endpoints
Filters & Offerings
GET /api/teacher/filters
→ { classes: [], subjects: [] }

GET /api/teacher/offerings
→ [ { id, class_name, subject_name } ]

GET /api/teacher/offering/:id
→ { offering_id, class_name, subject_name, students_count }

Courses (Libraries)
GET  /api/teacher/offerings/:assignmentId/libraries
POST /api/teacher/offerings/:assignmentId/libraries

Folders (Sections)
GET  /api/teacher/libraries/:libraryId/sections
POST /api/teacher/libraries/:libraryId/sections

Resources (Items)
GET  /api/teacher/sections/:sectionId/items
POST /api/teacher/sections/:sectionId/items

🖥 Frontend Flow

Load filters → /filters

Load offerings → /offerings

Show offering cards (Class + Subject)

Click Ouvrir → fetch offering detail + courses

Inside offering:

Create/view courses

Inside course: create/view folders

Inside folder: create/view resources

🔑 Auth

Requires Authorization: Bearer <jwt>.

JWT payload normalized:

userId or id → teacher id

role or user_role → must be TEACHER or ADMIN

🧑‍💻 Why These Changes

Support multiple courses per offering (like AlloSchool).

Normalize IDs (id, assignment_id, offering_id) to avoid undefined.

Fix createLibrary: no casting of assignmentId to Number (bigint safe).

Add no-cache headers to always load fresh HTML/JS.

Guard against missing DOM nodes to prevent crashes.

🧪 Test Dataset
INSERT INTO schools (id, name) VALUES
 ('11111111-1111-1111-1111-111111111111','Lycée Ibn Sina');

INSERT INTO users (id, school_id, email, first_name, last_name, role, password) VALUES
 ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
  'prof1@example.com','Fatima','Zahra','TEACHER','123');

INSERT INTO classes (id, school_id, name) VALUES
 ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','2ème Bac Sciences Physiques');

INSERT INTO subjects (id, school_id, name) VALUES
 ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','Physique-Chimie');

INSERT INTO teacher_assignments (id, teacher_id, class_id, subject_id, academic_year)
VALUES (1,'22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444','2024-2025');

INSERT INTO course_libraries (id, assignment_id, title) VALUES
 ('55555555-5555-5555-5555-555555555555',1,'Cours Mécanique');

✅ Merge Checklist

Keep column names (title for courses/folders, name+url for items).

Ensure /teacher serves teacher-dashboard.html with Cache-Control: no-store.

Store token in localStorage as token or authToken.

Use the same JWT_SECRET in auth and middleware.

If offerings return a different id field, keep normalization in renderOfferings()..

------

new updates:

)

📚 Teacher Course Library – Backend

Backend feature that lets teachers create courses (libraries), organize them into folders (sections), and manage resources (links & uploaded files). Uses Supabase (PostgREST + Storage) and enforces teacher ownership per assignment.

Scope of this change: backend only — routes, controllers, and config.
Frontend UI changes are out of scope for this PR.

Why this is useful

Teachers can structure materials by course and folder (Cours, Exercices, Vidéos).

Files upload directly to Supabase Storage with safe filenames.

Deleting a folder or course removes its items (and tries to clean Storage).

Items can be moved between folders (drag & drop on the UI → simple API here).

Data model used (already exists)

teacher_assignments — links teacher ↔ class ↔ subject (ownership anchor).

course_libraries — a course within an assignment.

library_sections — folders within a course.

library_items — resources (link or file) in a folder.

No DB migration required. (If you prefer exact storage keys in DB, you may add library_items.storage_key text later; not required — we reconstruct keys from the public URL on delete.)

Environment variables

Add/update in your backend .env (do not commit your secrets):

# Supabase project
SUPABASE_URL=https://<your-project>.supabase.co        # or DATABASE_URL as fallback
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_KEY=<service_role-key>                # server-only, never sent to client

# Storage
COURSE_BUCKET=course-files                             # must exist in Supabase Storage (recommend public)

# Server
PORT=5001
JWT_SECRET=<your-jwt-secret>


The backend uses the service key for Storage writes, so we don’t need Storage RLS policies for inserts.

Storage setup (Supabase)

Create a Storage bucket: course-files (recommended: Public for simple reads).

No special Storage policies required for uploads (server uses SUPABASE_SERVICE_KEY).

Upload path:
/<assignment_id>/<library_id>/<section_id>/<timestamp>-<safeFileName>

The server sanitizes filenames (ASCII, no spaces/odd chars, length-limited) to avoid “Invalid key” errors.

Install & run
cd backend
npm install
npm run dev     # nodemon app.js (or just `node app.js`)
# server listens on http://localhost:5001


Authentication is via Authorization: Bearer <JWT> (teacher user).
All endpoints enforce teacher ownership: assignment → library → section.

Folder structure (relevant files)
backend/
  config/
    db.js                      # exports supabase (anon) and supabaseAdmin (service key)
  controllers/
    libraryController.js       # all course/folder/resource handlers
  routes/
    library.js                 # routes → controller wiring (multer for uploads)
  app.js                       # registers routes (unchanged except for wiring)

API Reference

Base path prefix: /api/teacher

Libraries (courses)
Method	Path	Body (JSON)	Notes
GET	/offerings/:assignmentId/libraries	–	List libraries for an assignment (ownership enforced).
POST	/offerings/:assignmentId/libraries	{ "title": "Limites" }	Create a library; seeds 3 folders: Cours, Exercices, Vidéos.
PATCH	/libraries/:libraryId	{ "title"?, "status"? }	Rename/change status.
DELETE	/libraries/:libraryId	–	Delete course and all sections/items (tries to remove Storage objects).

Example — Create library

curl -X POST http://localhost:5001/api/teacher/offerings/<ASSIGNMENT_ID>/libraries \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"title":"Limites et continuité"}'


Response 201

{
  "id": "1a2b3c-...-z9",
  "title": "Limites et continuité",
  "status": "draft",
  "created_at": "2025-10-02T10:15:00Z"
}

Sections (folders)
Method	Path	Body (JSON)	Notes
GET	/libraries/:libraryId/sections	–	List folders in a library.
POST	/libraries/:libraryId/sections	{ "title": "Cours" }	Create a folder (position auto). 409 if duplicate.
DELETE	/sections/:sectionId	–	Delete folder and all resources (best-effort Storage cleanup).

Example — Create section

curl -X POST http://localhost:5001/api/teacher/libraries/<LIB_ID>/sections \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"title":"Exercices"}'

Items (resources)
Method	Path	Body	Notes
GET	/sections/:sectionId/items	–	List resources in a folder.
POST	/sections/:sectionId/items	{ "name": "...", "url": "...", "kind": "link" }	Add a link resource.
POST	/sections/:sectionId/items/upload	multipart/form-data with files[]	Upload one or more files. 50MB/file (configurable).
PATCH	/sections/:sectionId/items/:itemId	{ "name"?, "url"?, "kind"? }	Rename and/or update URL/kind.
DELETE	/sections/:sectionId/items/:itemId	–	Delete resource and try to delete Storage object.
POST	/sections/:fromSectionId/items/:itemId/move	{ "target_section_id": "<toId>" }	Move resource between folders (same library).

Example — Upload 2 files

curl -X POST http://localhost:5001/api/teacher/sections/<SECTION_ID>/items/upload \
  -H "Authorization: Bearer <TOKEN>" \
  -F "files=@/path/to/Cours1.pdf" \
  -F "files=@/path/to/TD1.pdf"


Upload response 201

[
  {
    "id": "d6f0...a1",
    "name": "Cours1.pdf",
    "url": "https://.../storage/v1/object/public/course-files/<...>/1696269392000-Cours1.pdf",
    "kind": "pdf",
    "size_bytes": 234567,
    "created_at": "2025-10-02T10:25:12Z"
  },
  {
    "id": "a3e2...c9",
    "name": "TD1.pdf",
    "url": "https://.../storage/v1/object/public/course-files/<...>/1696269392005-TD1.pdf",
    "kind": "pdf",
    "size_bytes": 198765,
    "created_at": "2025-10-02T10:25:12Z"
  }
]


Example — Move resource

curl -X POST http://localhost:5001/api/teacher/sections/<FROM_SECTION_ID>/items/<ITEM_ID>/move \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"target_section_id":"<TO_SECTION_ID>"}'

Error handling (what reviewers should expect)

400 — invalid/missing input (e.g., no files, empty title).

403 — ownership rejected (teacher doesn’t own assignment/library/section).

404 — not found (wrong IDs).

409 — conflict (duplicate section title within a library).

500 — unexpected error.
Uploads will not hit “RLS 403” anymore because Storage uses the service key. If SUPABASE_SERVICE_KEY is missing, the API returns a clear server error text.

Security

Service key is server-only, used to write to Storage (bypasses RLS).
Never expose it to the browser or commit to git.

Bucket can be Public for now (simple sharing). If you later switch to Private, we can return signed URLs in the controller without changing the upload flow.

Manual verification steps

Env set with SUPABASE_SERVICE_KEY and COURSE_BUCKET=course-files.

Start server → http://localhost:5001.

With a teacher JWT:

Create a library in an existing :assignmentId → expect 201 and 3 seeded folders.

Create a section → expect 201; duplicate name → expect 409.

Upload one or more PDFs to a section → expect 201; URLs open publicly.

Move a resource to another folder (same library) → expect 200.

Delete a section → items removed; Storage objects removed best-effort.

Delete a library → sections/items removed; Storage objects removed best-effort.

Known limitations (intentional)

Storage delete is best-effort (we reconstruct keys from public URLs).
If you want strict accounting, add library_items.storage_key text and persist the key at upload time.

Reordering sections/items isn’t included (positions exist for sections; drag sort could be added later).

Maximum file size is 50MB/file (tune multer limit as needed).

Suggested commits (Conventional Commits)

Use focused commits; details in the body:

chore(config): add Supabase admin client and env vars
feat(library): add course library API with folders and uploads
feat(library): move resource across folders
feat(library): cascade delete sections and libraries
fix(storage): sanitize filenames and surface clearer errors
docs(readme): add course library API, env, and verification steps

PR checklist (for reviewer)

 .env not committed; SUPABASE_SERVICE_KEY present locally on server.

 Storage bucket course-files exists (public is OK for now).

 config/db.js exports both clients: supabase (anon) and supabaseAdmin (service).

 Endpoints return expected codes (see Error handling).

 Upload creates files under /<assignment>/<library>/<section>/<ts>-<name>.

 Deleting a section removes its items; deleting a library removes all sections & items.

 No frontend assets changed in this PR (backend-only).

If you want me to convert this section into a full README (top-level with project intro, local dev scripts, linting/prettier, commitlint config), I can draft that too.