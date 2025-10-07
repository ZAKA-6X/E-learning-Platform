"use strict";

const supabase = require("../config/db");

function cleanProfile(row) {
  if (!row) return null;
  const school = row.school || row.schools || null;
  const klass = row.class || row.classes || null;
  const profile = {
    id: row.id,
    email: row.email,
    phone: row.phone || null,
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    role: row.role || null,
    status: row.status || null,
    created_at: row.created_at || null,
    last_login_at: row.last_login_at || null,
    school: school
      ? { id: school.id || school.school_id || null, name: school.name || null }
      : null,
    class: klass
      ? {
          id: klass.id || null,
          name: klass.name || null,
          room: klass.room || null,
        }
      : null,
  };

  profile.full_name = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!profile.full_name) profile.full_name = null;

  return profile;
}

exports.getProfile = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data, error } = await supabase
      .from("users")
      .select(
        `id,email,phone,first_name,last_name,role,status,created_at,last_login_at,
         school:schools(id,name),
         class:classes(id,name)`
      )
      .eq("id", userId)
      .single();

    if (error) {
      console.error("[usersController] getProfile", error);
      return res.status(500).json({ error: error.message || "Supabase error" });
    }

    const profile = cleanProfile(data);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    return res.json({ profile });
  } catch (err) {
    console.error("[usersController] getProfile", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.listTeachers = async (req, res) => {
  const requesterId = req.user?.id;
  const requesterRole = (req.user?.role || '').toLowerCase();
  if (!requesterId) return res.status(401).json({ error: "Unauthorized" });

  try {
    let teacherFilterIds = null;
    const teacherSubjects = new Map();

    if (requesterRole === 'student') {
      const { data: studentRow, error: studentError } = await supabase
        .from('users')
        .select('class_id')
        .eq('id', requesterId)
        .single();

      if (studentError) {
        console.error('[usersController] listTeachers student lookup', studentError);
        return res.status(500).json({ error: studentError.message || 'Supabase error' });
      }

      const classId = studentRow?.class_id;
      if (!classId) {
        return res.json({ teachers: [] });
      }

      const filterSet = new Set();

      const { data: assignmentRows, error: assignmentsError } = await supabase
        .from('teacher_assignments')
        .select('teacher_id, subject:subjects(id,name)')
        .eq('class_id', classId);

      if (assignmentsError) {
        console.error('[usersController] listTeachers assignments', assignmentsError);
        return res.status(500).json({ error: assignmentsError.message || 'Supabase error' });
      }

      (assignmentRows || []).forEach((row) => {
        const rawTeacherId = row?.teacher_id;
        const teacherId =
          typeof rawTeacherId === 'string'
            ? rawTeacherId.trim()
            : rawTeacherId && typeof rawTeacherId.toString === 'function'
            ? rawTeacherId.toString().trim()
            : null;
        if (!teacherId) return;
        filterSet.add(teacherId);
        const subjectName = row?.subject?.name || null;
        if (subjectName) {
          const list = teacherSubjects.get(teacherId) || [];
          list.push(subjectName);
          teacherSubjects.set(teacherId, Array.from(new Set(list)));
        }
      });

      if (filterSet.size === 0) {
        const { data: teacherRows, error: teacherMapError } = await supabase
          .from('teacher_class')
          .select('teacher_id')
          .eq('class_id', classId);

        if (teacherMapError) {
          console.error('[usersController] listTeachers teacher map', teacherMapError);
          return res.status(500).json({ error: teacherMapError.message || 'Supabase error' });
        }

        (teacherRows || []).forEach((row) => {
          const rawTeacherId = row?.teacher_id;
          const teacherId =
            typeof rawTeacherId === 'string'
              ? rawTeacherId.trim()
              : rawTeacherId && typeof rawTeacherId.toString === 'function'
              ? rawTeacherId.toString().trim()
              : null;
          if (teacherId) {
            filterSet.add(teacherId);
          }
        });
      }

      if (filterSet.size === 0) {
        return res.json({ teachers: [] });
      }

      teacherFilterIds = Array.from(filterSet).map((value) => {
        if (typeof value === 'string') return value.trim();
        if (value && typeof value.toString === 'function') {
          return value.toString().trim();
        }
        return '';
      }).filter(Boolean);
    }

    let query = supabase
      .from('users')
      .select(
        `id,email,phone,first_name,last_name,role,status,created_at,
         school:schools(id,name),
         class:classes(id,name)`
      )
      .order('last_name', { ascending: true, nullsFirst: true })
      .order('first_name', { ascending: true, nullsFirst: true });

    if (Array.isArray(teacherFilterIds) && teacherFilterIds.length > 0) {
      query = query.in('id', teacherFilterIds);
    } else {
      query = query.ilike('role', 'teacher');
    }

    const { data, error } = await query;

    if (error) {
      console.error("[usersController] listTeachers", error);
      return res.status(500).json({ error: error.message || "Supabase error" });
    }

    const teachers = (data || [])
      .map(cleanProfile)
      .filter((profile) => profile && profile.id)
      .map((profile) => {
        const id =
          typeof profile.id === 'string'
            ? profile.id.trim()
            : profile.id && typeof profile.id.toString === 'function'
            ? profile.id.toString().trim()
            : null;
        if (!id) return null;
        const subjects = teacherSubjects.get(id) || [];
        return {
          id,
          email: profile.email,
          first_name: profile.first_name,
          last_name: profile.last_name,
          full_name: profile.full_name || profile.email || "Enseignant",
          role: profile.role,
          school: profile.school,
          class: profile.class,
          subject:
            (Array.isArray(subjects) && subjects[0]) || null,
          subjects,
      };
      });

    return res.json({ teachers: teachers.filter(Boolean) });
  } catch (err) {
    console.error("[usersController] listTeachers", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.listClassmates = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data: currentUser, error: currentError } = await supabase
      .from("users")
      .select("id,class_id,school_id")
      .eq("id", userId)
      .single();

    if (currentError) {
      console.error("[usersController] listClassmates current", currentError);
      return res.status(500).json({ error: currentError.message || "Supabase error" });
    }

    if (!currentUser?.class_id) {
      return res.json({ classmates: [] });
    }

    const classId = currentUser.class_id;

    const { data: classmatesRaw, error: classmatesError } = await supabase
      .from("users")
      .select(
        `id,email,first_name,last_name,role,status,last_login_at,class_id`
      )
      .eq("class_id", classId)
      .neq("id", userId)
      .order("last_name", { ascending: true, nullsFirst: true })
      .order("first_name", { ascending: true, nullsFirst: true });

    if (classmatesError) {
      console.error("[usersController] listClassmates", classmatesError);
      return res
        .status(500)
        .json({ error: classmatesError.message || "Supabase error" });
    }

    const classmates = (classmatesRaw || []).map((row) => {
      const fullName = [row.first_name, row.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      return {
        id: row.id,
        email: row.email,
        role: row.role,
        full_name: fullName || row.email,
        first_name: row.first_name,
        last_name: row.last_name,
        status: row.status,
        last_login_at: row.last_login_at,
      };
    });

    let classInfo = null;
    try {
      const { data: classRow, error: classError } = await supabase
        .from("classes")
        .select("id,name,room")
        .eq("id", classId)
        .single();

      if (!classError && classRow) {
        classInfo = classRow;
      }
    } catch (classLookupErr) {
      console.warn("[usersController] listClassmates class lookup", classLookupErr);
    }

    return res.json({
      classmates,
      class: classInfo,
    });
  } catch (err) {
    console.error("[usersController] listClassmates unexpected", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
