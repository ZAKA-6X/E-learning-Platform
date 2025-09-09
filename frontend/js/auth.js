// frontend/js/auth.js
(function () {
  const form = document.getElementById("login-form");
  const emailEl = document.getElementById("email");
  const passEl = document.getElementById("password");
  const errorEl = document.getElementById("login-error");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.textContent = "";

    const email = emailEl.value.trim();
    const password = passEl.value;

    try {
      const resp = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        const msg = data?.message || data?.error || "Échec de connexion.";
        if (errorEl) errorEl.textContent = msg;
        else alert(msg);
        return;
      }

      // Save JWT so other pages can send Authorization: Bearer
      localStorage.setItem("token", data.token);

      // Redirect to teacher dashboard (adjust if needed)
      window.location.href = "/pages/teacher-dashboard.html";
    } catch (err) {
      console.error("[login]", err);
      if (errorEl) errorEl.textContent = "Erreur réseau.";
      else alert("Erreur réseau.");
    }
  });
})();
