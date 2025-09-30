// frontend/js/auth.js
const form = document.getElementById("login-form");
const errorBox = document.getElementById("login-error");

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

    if (!res.ok) {
      errorBox.textContent = data.message || data.error || "Échec de la connexion.";
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    // simple role-based redirect
    if (data.user.role === "teacher") {
      window.location.href = "/teacher";
    } else if (data.user.role === "ADMIN") {
      window.location.href = "/admin-dashboard.html";
    } else {
      window.location.href = "/"; // or a student dashboard if you have one
    }
  } catch (err) {
    console.error(err);
    errorBox.textContent = "Erreur réseau ou serveur.";
  }
});
