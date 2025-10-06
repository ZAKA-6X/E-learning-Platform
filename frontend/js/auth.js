document.addEventListener("DOMContentLoaded", () => {

  const toast = (message, type) => {
    if (!message) return;
    if (window.notify?.toast) {
      window.notify.toast({ message, type });
    } else {
      window.alert(message);
    }
  };
// frontend/js/auth.js
const form = document.getElementById("login-form");
const errorBox = document.getElementById("login-error");

if (!form) {
  return; // nothing to wire on pages that have no login form
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.textContent = "";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

      if (res.ok) {
        // ✅ Save token & user data
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));

        // ✅ Redirect based on role
        if (data.user.role === "admin") {
          window.location.href = "../pages/admin-dashboard.html";
        } else if (data.user.role === "teacher") {
          window.location.href = "../pages/teacher-dashboard.html";
        } else if (data.user.role === "student") {
          window.location.href = "../pages/student-dashboard.html";
        } else {
          alert("Unknown role");
        }
      } else {
        alert(data.message || "Login failed");
      }
    } catch (error) {
      console.error("Login error:", error);
    }
  });
});
