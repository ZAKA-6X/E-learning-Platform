// backend/controllers/todosController.js

const supabase = require("../config/db");

/**
 * GET /todos → List user's todos
 */
exports.getTodos = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({ error: "Missing user id in token" });
    }

    const { data, error } = await supabase
      .from("todolist")
      .select("id, created_at, user_id, data, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase getTodos error:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data || []);
  } catch (err) {
    console.error("Unexpected error in getTodos:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /todos → Add a new todo
 * Accepts { data: string } OR { text: string }
 */
exports.addTodo = async (req, res) => {
  try {
    const userId = req.user?.id;
    const textRaw = (req.body && (req.body.data ?? req.body.text)) ?? "";
    const text = String(textRaw).trim();

    if (!userId)
      return res.status(400).json({ error: "Missing user id in token" });
    if (!text) return res.status(400).json({ error: "Task text is required" });

    const { data, error } = await supabase
      .from("todolist")
      .insert([{ user_id: userId, data: text, status: false }])
      .select("id, created_at, user_id, data, status");

    if (error) {
      console.error("Supabase addTodo error:", error);
      return res.status(500).json({ error: error.message });
    }

    const row = Array.isArray(data) ? data[0] : data;
    return res.status(201).json(row);
  } catch (err) {
    console.error("Unexpected error in addTodo:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PUT /todos/:id → Edit todo text
 * Body: { data: string } OR { text: string }
 */
exports.updateTodo = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const textRaw = (req.body && (req.body.data ?? req.body.text)) ?? "";
    const text = String(textRaw).trim();

    if (!userId)
      return res.status(400).json({ error: "Missing user id in token" });
    if (!id) return res.status(400).json({ error: "Missing todo id" });
    if (!text) return res.status(400).json({ error: "Task text is required" });

    const { data, error } = await supabase
      .from("todolist")
      .update({ data: text })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id, created_at, user_id, data, status")
      .single();

    if (error) {
      console.error("Supabase updateTodo error:", error);
      return res.status(500).json({ error: error.message });
    }
    if (!data) return res.status(404).json({ error: "Todo not found" });

    return res.json(data);
  } catch (err) {
    console.error("Unexpected error in updateTodo:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /todos/:id/status → Set completion status
 * Body: { status: boolean }
 */
exports.updateStatus = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { status } = req.body;

    if (!userId)
      return res.status(400).json({ error: "Missing user id in token" });
    if (typeof status !== "boolean")
      return res.status(400).json({ error: "status must be boolean" });

    const { data, error } = await supabase
      .from("todolist")
      .update({ status })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id, created_at, user_id, data, status")
      .single();

    if (error) {
      console.error("Supabase updateStatus error:", error);
      return res.status(500).json({ error: error.message });
    }
    if (!data) return res.status(404).json({ error: "Todo not found" });

    return res.json(data);
  } catch (err) {
    console.error("Unexpected error in updateStatus:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /todos/:id → Delete a todo
 */
exports.deleteTodo = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId)
      return res.status(400).json({ error: "Missing user id in token" });
    if (!id) return res.status(400).json({ error: "Missing todo id" });

    const { data, error } = await supabase
      .from("todolist")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .single();

    if (error) {
      console.error("Supabase deleteTodo error:", error);
      return res.status(500).json({ error: error.message });
    }
    if (!data) return res.status(404).json({ error: "Todo not found" });

    return res.status(204).send();
  } catch (err) {
    console.error("Unexpected error in deleteTodo:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
