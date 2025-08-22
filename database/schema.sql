schools ──┬──< academic_years ──< terms
          ├──< users >──┬──< user_roles >── roles >──< role_permissions >── permissions
          │             └──< notifications
          │
          ├──< levels ──< classes >──< class_subjects >── subjects
          │                └──< enrollments >── users (students)
          │                └──< teacher_assignments >── users (teachers)
          │
          ├──< guardians >──< student_guardians >── users (students)
          ├──< groups >──< user_groups >── users
          │
          ├──< courses ──┬──< course_teachers >── users (teachers)
          │              ├──< course_enrollments >── users (students)
          │              ├──< course_units
          │              └──< course_items ──(file/link/assignment/quiz/page)
          │                               └──< submissions >── users (students)
          │
          ├──< files (used by course_items/submissions)
          │
          ├──< timetable_slots ──< attendance_sessions ──< attendance_records >── users (students)
          │
          ├──< exams ──< exam_results >── users (students)
          │
          ├──< announcements
          ├──< alerts
          ├──< activity_logs
          └──< import_jobs ──< import_rows

-----------------------------------------------------------------------

Setup year: schools → academic_years (+ terms) → levels → classes → subjects → class_subjects.

Users/Roles: create users (admins/teachers/students/guardians), attach roles via user_roles.

Enrollments: students ↔ classes per academic_year; teacher_assignments for classes+subjects.

Courses: create courses per year; attach course_teachers & course_enrollments; add units/items; students submit work.

Timetable & Attendance: define weekly slots → generate/hold sessions → teachers mark attendance_records.

Assessments: schedule exams → record exam_results.

Comms & Ops: announcements to audiences; notifications to users; alerts detect problems; activity_logs track actions.

Imports: CSV/Excel flows tracked by import_jobs and import_rows.

-----------------------------------------------------------------------



/*
===========================================================
 ClicaEd Database Glossary — Human Readable Schema
===========================================================

SCHOOL
- One institution (e.g., “Collège Al Amal – Casablanca”).
- Top-level tenant. Everything else belongs to a school.

ACADEMIC_YEAR
- A school year, e.g., "2025-2026".
- Has start and end date; one can be current.

TERM
- A subdivision of the academic year (Trimestre or Semestre).
- Used for exams, reports, attendance summaries.

USER
- Any person with an account (student, teacher, admin, guardian).
- Fields: name, email, phone, status, last_login_at.

ROLE
- Defines what a user can do: admin, teacher, student, guardian.
- Mapped to permissions.

PERMISSION
- Fine-grained action like 'grades.write' or 'users.read'.

USER_ROLE
- Link between users and roles (many-to-many).

ROLE_PERMISSION
- Link between roles and permissions.

LEVEL
- Educational stage/grade (e.g., 1AP, 6AP, 1AC, 2BAC).

CLASS
- A homeroom/group of students inside a level.
- Example: "2BAC Sciences Physiques A".

SUBJECT
- A discipline taught at school (Maths, Physics, French).

CLASS_SUBJECT
- Link between classes and subjects (many-to-many).

ENROLLMENT
- Student assigned to a class in a given year.

TEACHER_ASSIGNMENT
- Which teacher teaches which subject in which class.

GUARDIAN
- Parent or legal tutor of a student.
- Stores first/last name, phone, email, relation.

STUDENT_GUARDIAN
- Link between student and guardian(s).
- One student can have multiple guardians.

GROUP
- Subset of students (e.g., "Group A" or "Club Robotique").

USER_GROUP
- Link between users and groups.

COURSE
- Digital container for a subject taught to a class.
- Example: "Mathématiques – 2BAC SP-A (2025-2026)".
- Has status: draft, published, archived.

COURSE_TEACHER
- Link between a course and teacher(s).
- Supports co-teachers.

COURSE_ENROLLMENT
- Link between a course and enrolled students.

COURSE_UNIT
- Section inside a course (e.g., "Chapter 1: Algebra").

COURSE_ITEM
- Content inside a course.
- Types: file, link, assignment, quiz, page.
- Can have due dates, points, published/unpublished.

SUBMISSION
- A student’s answer/upload for an assignment/quiz.
- Status: pending, submitted, graded.

FILE
- Any uploaded file (lesson PDF, submission, logo).
- Stored in Supabase Storage.

TIMETABLE_SLOT
- Scheduled weekly block: class, subject, teacher, weekday/time.

ATTENDANCE_SESSION
- Specific occurrence of a timetable slot on a date.
- Used to record attendance.

ATTENDANCE_RECORD
- Student’s presence status in a session (present, absent, late, excused).

EXAM
- Assessment scheduled for a class+subject within a term.
- Example: Physics Midterm, max score 20.

EXAM_RESULT
- Student’s score in an exam.

ANNOUNCEMENT
- School-wide or targeted message (exam dates, events).

NOTIFICATION
- Personal in-app message (e.g., "Your assignment was graded").

ALERT
- System-generated warning (empty course, no teacher assigned, etc.).

ACTIVITY_LOG
- Audit trail of actions (admin created user, teacher graded assignment).

IMPORT_JOB
- Batch import from CSV/Excel (users, enrollments, courses).
- Tracks status and summary.

IMPORT_ROW
- A single row from an import job with validation info.
===========================================================
*/
