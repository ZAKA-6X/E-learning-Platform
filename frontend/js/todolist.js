// frontend/js/todolist.js

// ---- Small utilities ----
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function apiFetch(url, opts = {}) {
  const token = localStorage.getItem("token");
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
}

const toast = (message, type) => {
  if (!message) return;
  if (window.notify?.toast) {
    window.notify.toast({ message, type });
  } else {
    window.alert(message);
  }
};

// ---- State ----
let CURRENT_TODOS = [];

// ---- Render & Load ----
async function loadTodos() {
  const listEl = document.getElementById("todo-list");
  if (!listEl) {
    console.warn('Element with id "todo-list" not found.');
    return;
  }

  try {
    const res = await apiFetch("/todos");
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }
    const todos = await res.json();
    CURRENT_TODOS = todos;

    if (!todos || todos.length === 0) {
      listEl.innerHTML = `<li class="py-2 text-sm text-gray-500">Aucune tâche pour le moment.</li>`;
      return;
    }

    listEl.innerHTML = "";
    todos.forEach((t) => {
      const li = document.createElement("li");
      li.className =
        "flex items-center justify-between gap-3 py-2 border-b border-gray-200";
      li.innerHTML = `
        <label class="flex items-center gap-2 flex-1">
          <input type="checkbox" class="todo-toggle" data-id="${t.id}" ${t.status ? "checked" : ""} />
          <span class="text-sm ${t.status ? "line-through opacity-60" : ""}">
            ${escapeHtml(t.data || "")}
          </span>
        </label>
        <div class="flex items-center gap-2">
          <button class="todo-edit px-2 py-1 text-xs border rounded" data-id="${t.id}">Modifier</button>
          <button class="todo-delete px-2 py-1 text-xs border rounded" data-id="${t.id}">Supprimer</button>
        </div>
      `;
      listEl.appendChild(li);
    });
  } catch (err) {
    console.error("Failed to load todos:", err);
    listEl.innerHTML = `<li class="py-2 text-sm text-red-600">Erreur de chargement des tâches.</li>`;
  }
}

// ---- Create ----
async function handleAdd(e) {
  if (e) e.preventDefault(); // avoid form submission
  const input = document.getElementById("todo-input");
  if (!input) return;

  const value = input.value.trim();
  if (!value) return;

  try {
    const res = await apiFetch("/todos", {
      method: "POST",
      body: JSON.stringify({ data: value }),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }
    input.value = "";
    await loadTodos();
  } catch (e2) {
    console.error("Failed to add todo:", e2.message || e2);
    toast("Échec d’ajout de la tâche. Voir la console pour le détail.", "error");
  }
}

// ---- Delegated Events (toggle/edit/delete) ----
function bindListEvents() {
  const listEl = document.getElementById("todo-list");
  if (!listEl) return;

  // Toggle status
  listEl.addEventListener("change", async (e) => {
    const target = e.target;
    if (target.classList.contains("todo-toggle")) {
      const id = target.getAttribute("data-id");
      const checked = !!target.checked;
      try {
        const res = await apiFetch(`/todos/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: checked }),
        });
        if (!res.ok) throw new Error(await res.text());
        await loadTodos();
      } catch (err) {
        console.error("Failed to toggle status:", err);
      }
    }
  });

  // Edit & Delete
  listEl.addEventListener("click", async (e) => {
    const target = e.target;

    // Edit
    if (target.classList.contains("todo-edit")) {
      const id = target.getAttribute("data-id");
      const current = CURRENT_TODOS.find((t) => String(t.id) === String(id));
      const next = prompt("Modifier la tâche :", current ? current.data : "");
      if (next === null) return;

      try {
        const res = await apiFetch(`/todos/${id}`, {
          method: "PUT",
          body: JSON.stringify({ data: next }),
        });
        if (!res.ok) throw new Error(await res.text());
        await loadTodos();
      } catch (err) {
        console.error("Failed to edit todo:", err);
      }
    }

    // Delete
    if (target.classList.contains("todo-delete")) {
      const id = target.getAttribute("data-id");
      let confirmed = true;
      if (window.notify?.confirm) {
        confirmed = await window.notify.confirm({
          title: "Supprimer la tâche",
          message: "Êtes-vous sûr de vouloir supprimer cette tâche ?",
          confirmText: "Supprimer",
          cancelText: "Annuler",
        });
      } else if (!window.confirm("Supprimer cette tâche ?")) {
        confirmed = false;
      }
      if (!confirmed) return;

      try {
        const res = await apiFetch(`/todos/${id}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204) throw new Error(await res.text());
        await loadTodos();
      } catch (err) {
        console.error("Failed to delete todo:", err);
      }
    }
  });
}

// ---- Add-input bindings ----
function bindAddControls() {
  const btn = document.getElementById("todo-add");
  const input = document.getElementById("todo-input");

  // If inside a <form>, intercept the submit
  const form = input ? input.closest("form") : null;
  if (form) form.addEventListener("submit", handleAdd);

  if (btn) btn.addEventListener("click", handleAdd);
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAdd(e);
    });
  }
}

// ---- Init ----
document.addEventListener("DOMContentLoaded", () => {
  bindAddControls();
  bindListEvents();
  loadTodos();
});
