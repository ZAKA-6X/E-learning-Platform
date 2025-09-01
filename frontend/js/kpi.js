// KPI loader (students + upcoming exams)
(function () {
  const studentsEl = document.getElementById("kpi-students");
  const examsEl = document.getElementById("kpi-exams");
  if (!studentsEl && !examsEl) return;

  // Change this to "/api/admin" if you mounted routes there:
  const API_PREFIX = "/admin";

  function authHeaders() {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function toNumber(x, fallback = 0) {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  }

  async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      let errBody = {};
      try {
        errBody = await res.json();
      } catch {}
      throw new Error(`${res.status} ${errBody.message || ""}`.trim());
    }
    return res.json();
  }

  async function loadStudentsCount() {
    if (!studentsEl) return;
    try {
      const headers = { "Content-Type": "application/json", ...authHeaders() };
      if (!headers.Authorization) {
        studentsEl.textContent = "error";
        console.warn("No token in localStorage");
        return;
      }
      const data = await fetchJSON(`${API_PREFIX}/kpis/students-count`, {
        headers,
      });
      studentsEl.textContent = String(toNumber(data?.count, 0));
    } catch (e) {
      console.error("Failed to load students KPI:", e);
      studentsEl.textContent = "error";
    }
  }

  async function loadExamsUpcomingCount() {
    if (!examsEl) return;
    try {
      const headers = authHeaders();
      if (!headers.Authorization) {
        examsEl.textContent = "0";
        console.warn("No token in localStorage");
        return;
      }
      // Upcoming exams (still available if you want it)
      const data = await fetchJSON(`${API_PREFIX}/kpis/exams-upcoming-count`, {
        headers,
      });
      console.log("Upcoming Exams KPI data:", data);
      examsEl.textContent = String(toNumber(data?.count, 0));
    } catch (e) {
      console.error("Failed to load exams KPI:", e);
      examsEl.textContent = "0";
    }
  }

  function init() {
    loadStudentsCount();
    loadExamsUpcomingCount();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
