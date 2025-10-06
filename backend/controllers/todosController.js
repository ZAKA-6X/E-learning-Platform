// backend/controllers/todosController.js
const supabase = require('../config/db');

function assertUser(req, res) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return userId;
}

function normalizeId(raw) {
  if (raw === undefined || raw === null) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

exports.list = async (req, res) => {
  const userId = assertUser(req, res);
  if (!userId) return;

  const { data, error } = await supabase
    .from('todolist')
    .select('id, data, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[todos] list error', error);
    return res.status(500).json({ error: 'Unable to load todos' });
  }

  res.json(Array.isArray(data) ? data : []);
};

exports.create = async (req, res) => {
  const userId = assertUser(req, res);
  if (!userId) return;

  const input = (req.body?.data || '').trim();
  if (!input) {
    return res.status(400).json({ error: 'data is required' });
  }

  const { data, error } = await supabase
    .from('todolist')
    .insert({ data: input, status: false, user_id: userId })
    .select('id, data, status, created_at')
    .single();

  if (error) {
    console.error('[todos] create error', error);
    return res.status(500).json({ error: 'Unable to create todo' });
  }

  res.status(201).json(data);
};

exports.updateData = async (req, res) => {
  const userId = assertUser(req, res);
  if (!userId) return;

  const todoId = normalizeId(req.params?.id);
  if (!todoId) {
    return res.status(400).json({ error: 'Invalid todo id' });
  }

  const input = (req.body?.data || '').trim();
  if (!input) {
    return res.status(400).json({ error: 'data is required' });
  }

  const { data, error } = await supabase
    .from('todolist')
    .update({ data: input })
    .eq('user_id', userId)
    .eq('id', todoId)
    .select('id, data, status, created_at')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Todo not found' });
    }
    console.error('[todos] update error', error);
    return res.status(500).json({ error: 'Unable to update todo' });
  }

  res.json(data);
};

exports.updateStatus = async (req, res) => {
  const userId = assertUser(req, res);
  if (!userId) return;

  const todoId = normalizeId(req.params?.id);
  if (!todoId) {
    return res.status(400).json({ error: 'Invalid todo id' });
  }

  const rawStatus = req.body?.status;
  const status = rawStatus === true || rawStatus === 'true' || rawStatus === 1;

  const { data, error } = await supabase
    .from('todolist')
    .update({ status })
    .eq('user_id', userId)
    .eq('id', todoId)
    .select('id, data, status, created_at')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Todo not found' });
    }
    console.error('[todos] update status error', error);
    return res.status(500).json({ error: 'Unable to update status' });
  }

  res.json(data);
};

exports.remove = async (req, res) => {
  const userId = assertUser(req, res);
  if (!userId) return;

  const todoId = normalizeId(req.params?.id);
  if (!todoId) {
    return res.status(400).json({ error: 'Invalid todo id' });
  }

  const { data, error } = await supabase
    .from('todolist')
    .delete()
    .eq('user_id', userId)
    .eq('id', todoId)
    .select('id')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Todo not found' });
    }
    console.error('[todos] delete error', error);
    return res.status(500).json({ error: 'Unable to delete todo' });
  }

  res.status(204).send();
};
