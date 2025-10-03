// backend/config/db.js
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// Load environment from project root (.env) then backend/.env (if present)
dotenv.config();
dotenv.config({ path: path.join(__dirname, '../.env') });

const url = process.env.SUPABASE_URL || process.env.DATABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url) {
  throw new Error('[supabase] Missing SUPABASE_URL or DATABASE_URL');
}
if (!anonKey) {
  throw new Error('[supabase] Missing SUPABASE_ANON_KEY');
}

// anon client — use for queries that respect RLS
const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// service client — optional, for privileged operations (storage, cron, etc.)
const supabaseAdmin = serviceKey
  ? createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// default export for legacy imports; named exports for new code
module.exports = supabase;
module.exports.supabase = supabase;
module.exports.supabaseAdmin = supabaseAdmin;
