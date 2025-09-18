document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");

  const toast = (message, type) => {
    if (!message) return;
    if (window.notify?.toast) {
      window.notify.toast({ message, type });
    } else {
      window.alert(message);
    }
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
      const res = await fetch("/login", {
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
          toast("Rôle inconnu", "error");
        }
      } else {
        toast(data.message || "Connexion échouée", "error");
      }
    } catch (error) {
      console.error("Login error:", error);
      toast("Erreur réseau lors de la connexion", "error");
    }
  });
});
