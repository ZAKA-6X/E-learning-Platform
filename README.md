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

If offerings return a different id field, keep normalization in renderOfferings().