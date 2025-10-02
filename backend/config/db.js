// backend/config/db.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL || process.env.DATABASE_URL;

// anon client — DB queries (respect RLS)
const supabase = createClient(url, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// service client — server-only; use for Storage writes (bypass Storage RLS)
const supabaseAdmin = process.env.SUPABASE_SERVICE_KEY
  ? createClient(url, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// default + named exports (compatible with old imports)
module.exports = supabase;
module.exports.supabase = supabase;
module.exports.supabaseAdmin = supabaseAdmin;
