-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.classes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT classes_pkey PRIMARY KEY (id),
  CONSTRAINT classes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id)
);
CREATE TABLE public.course_libraries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assignment_id bigint NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT course_libraries_pkey PRIMARY KEY (id),
  CONSTRAINT course_libraries_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.teacher_assignments(id)
);
CREATE TABLE public.library_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind = ANY (ARRAY['pdf'::text, 'image'::text, 'video'::text, 'link'::text, 'other'::text])),
  name text NOT NULL,
  url text NOT NULL,
  size_bytes bigint,
  position integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  storage_key text,
  CONSTRAINT library_items_pkey PRIMARY KEY (id),
  CONSTRAINT library_items_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.library_sections(id)
);
CREATE TABLE public.student_exercise_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  course_id uuid NOT NULL,
  item_id uuid NOT NULL,
  file_url text,
  file_name text,
  file_size bigint,
  mime_type text,
  storage_key text,
  submitted_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT student_exercise_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT student_exercise_submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id),
  CONSTRAINT student_exercise_submissions_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.course_libraries(id) ON DELETE CASCADE,
  CONSTRAINT student_exercise_submissions_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.library_items(id) ON DELETE CASCADE,
  CONSTRAINT student_exercise_submissions_unique_student_item UNIQUE (student_id, item_id)
);
CREATE TABLE public.library_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL,
  title text NOT NULL,
  position integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT library_sections_pkey PRIMARY KEY (id),
  CONSTRAINT library_sections_library_id_fkey FOREIGN KEY (library_id) REFERENCES public.course_libraries(id)
);
CREATE TABLE public.post_attachments (
  id bigint NOT NULL DEFAULT nextval('post_attachments_id_seq'::regclass),
  post_id bigint NOT NULL,
  url text NOT NULL,
  filename text,
  size_bytes bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  media_type USER-DEFINED NOT NULL DEFAULT 'other'::media_type,
  CONSTRAINT post_attachments_pkey PRIMARY KEY (id),
  CONSTRAINT post_attachments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);
CREATE TABLE public.post_comment_votes (
  id bigint NOT NULL DEFAULT nextval('post_comment_votes_id_seq'::regclass),
  comment_id bigint NOT NULL,
  user_id uuid NOT NULL,
  value smallint NOT NULL CHECK (value = ANY (ARRAY[1, '-1'::integer])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT post_comment_votes_pkey PRIMARY KEY (id),
  CONSTRAINT post_comment_votes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.post_comments(id),
  CONSTRAINT post_comment_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.post_comments (
  id bigint NOT NULL DEFAULT nextval('post_comments_id_seq'::regclass),
  post_id bigint NOT NULL,
  user_id uuid NOT NULL,
  parent_id bigint,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT post_comments_pkey PRIMARY KEY (id),
  CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id),
  CONSTRAINT post_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT post_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.post_comments(id)
);
CREATE TABLE public.post_votes (
  id bigint NOT NULL DEFAULT nextval('post_votes_id_seq'::regclass),
  post_id bigint NOT NULL,
  user_id uuid NOT NULL,
  value smallint NOT NULL CHECK (value = ANY (ARRAY[1, '-1'::integer])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT post_votes_pkey PRIMARY KEY (id),
  CONSTRAINT post_votes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id),
  CONSTRAINT post_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.posts (
  id bigint NOT NULL DEFAULT nextval('posts_id_seq'::regclass),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  body_html text,
  class_id uuid,
  subject_id uuid,
  audience USER-DEFINED NOT NULL DEFAULT 'SCHOOL'::post_audience,
  CONSTRAINT posts_pkey PRIMARY KEY (id),
  CONSTRAINT posts_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id),
  CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT posts_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
  CONSTRAINT posts_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id)
);
CREATE TABLE public.schools (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  legal_name character varying,
  city character varying,
  logo_url text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT schools_pkey PRIMARY KEY (id)
);
CREATE TABLE public.subjects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT subjects_pkey PRIMARY KEY (id),
  CONSTRAINT subjects_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id)
);
CREATE TABLE public.teacher_assignments (
  id bigint NOT NULL DEFAULT nextval('teacher_assignments_id_seq'::regclass),
  teacher_id uuid NOT NULL,
  class_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  academic_year text NOT NULL,
  term text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT teacher_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT teacher_assignments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.users(id),
  CONSTRAINT teacher_assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
  CONSTRAINT teacher_assignments_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id)
);
CREATE TABLE public.teacher_class (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  class_id uuid,
  teacher_id uuid,
  CONSTRAINT teacher_class_pkey PRIMARY KEY (id),
  CONSTRAINT teacher_class_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
  CONSTRAINT teacher_class_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.users(id)
);
CREATE TABLE public.teacher_subjects (
  id bigint NOT NULL DEFAULT nextval('teacher_subjects_id_seq'::regclass),
  teacher_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  CONSTRAINT teacher_subjects_pkey PRIMARY KEY (id),
  CONSTRAINT teacher_subjects_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.users(id),
  CONSTRAINT teacher_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id)
);
CREATE TABLE public.direct_messages (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  student_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  body text NOT NULL,
  read_at timestamp with time zone,
  CONSTRAINT direct_messages_pkey PRIMARY KEY (id),
  CONSTRAINT direct_messages_sender_id_check CHECK (sender_id = student_id OR sender_id = teacher_id),
  CONSTRAINT direct_messages_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT direct_messages_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT direct_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE
);
CREATE INDEX direct_messages_conversation_idx ON public.direct_messages USING btree (student_id, teacher_id, created_at);
CREATE TABLE public.todolist (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid,
  data text,
  status boolean,
  CONSTRAINT todolist_pkey PRIMARY KEY (id),
  CONSTRAINT todolist_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid,
  auth_user_id uuid UNIQUE,
  email USER-DEFINED NOT NULL UNIQUE,
  phone text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'active'::user_status,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  search_tsv tsvector DEFAULT to_tsvector('simple'::regconfig, ((((((COALESCE(first_name, ''::text) || ' '::text) || COALESCE(last_name, ''::text)) || ' '::text) || COALESCE((email)::text, ''::text)) || ' '::text) || COALESCE(phone, ''::text))),
  password text,
  role text,
  class_id uuid,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
  CONSTRAINT users_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id),
  CONSTRAINT users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id)
);
