const jwt = require('jsonwebtoken');

/**
 * Accepts tokens that may have keys:
 *  - userId OR id OR user_id
 *  - role OR user_role OR permissions.role
 *  - schoolId OR school_id
 *  - email, first_name/last_name (optional)
 */
function normalizePayload(p) {
  if (!p || typeof p !== 'object') return null;

  const userId =
    p.userId ||
    p.id ||
    p.user_id ||
    (p.user && (p.user.id || p.user.userId)) ||
    null;

  let role =
    p.role ||
    p.user_role ||
    (p.permissions && p.permissions.role) ||
    (p.user && p.user.role) ||
    null;
  const roleRaw = role || null;
  if (typeof role === 'string') role = role.toUpperCase();

  const schoolId =
    p.schoolId ||
    p.school_id ||
    (p.user && (p.user.schoolId || p.user.school_id)) ||
    null;

  return {
    userId,
    role,
    roleRaw,
    schoolId,
    email: p.email || (p.user && p.user.email) || null,
    name:
      p.name ||
      (p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : null) ||
      (p.user && p.user.name) ||
      null,
    _raw: p,
  };
}

function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Bearer token' });
    }
    const token = auth.slice(7);

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    const norm = normalizePayload(payload);
    if (!norm || !norm.userId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    req.user = {
      id: norm.userId,
      userId: norm.userId,
      user_id: norm.userId,
      role: norm.role,
      roleRaw: norm.roleRaw,
      schoolId: norm.schoolId,
      school_id: norm.schoolId,
      email: norm.email,
      name: norm.name,
      _raw: norm._raw,
    };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Case-insensitive role guard; accepts TEACHER or ADMIN as teacher-level
function requireRole(...roles) {
  const upper = roles.map((r) => String(r).toUpperCase());
  return (req, res, next) => {
    const role = (req.user && req.user.role) || '';
    if (!role) return res.status(403).json({ error: 'Forbidden' });
    if (!upper.includes(role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

const requireTeacher = requireRole('teacher', 'ADMIN');

module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
module.exports.requireRole = requireRole;
module.exports.requireTeacher = requireTeacher;
