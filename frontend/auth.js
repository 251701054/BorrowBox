
const API_URL = (
  window.BORROWBOX_API_URL ||
  (location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
    ? "http://localhost:3000/api"
    : "/api")
).replace(/\/$/, "");

const signinTab = document.getElementById("tab-signin");
const signupTab = document.getElementById("tab-signup");
const signinForm = document.getElementById("signin-form");
const signupForm = document.getElementById("signup-form");
const notice = document.getElementById("notice");

function message(text, type = "error") {
  notice.textContent = text;
  notice.className = `notice ${type}`;
  notice.hidden = !text;
}

function switchMode(mode) {
  const signin = mode === "signin";

  signinForm.hidden = !signin;
  signupForm.hidden = signin;
  signinTab.classList.toggle("active", signin);
  signupTab.classList.toggle("active", !signin);

  signinTab.setAttribute("aria-selected", String(signin));
  signupTab.setAttribute("aria-selected", String(!signin));

  document.getElementById("heading").textContent =
    signin ? "Welcome back" : "Create your account";

  document.getElementById("subheading").textContent =
    signin
      ? "Sign in to continue to your campus workspace."
      : "Join BorrowBox to reserve campus equipment.";

  message("");
}

signinTab.addEventListener("click", () => switchMode("signin"));
signupTab.addEventListener("click", () => switchMode("signup"));

document.querySelectorAll("[data-switch]").forEach(button => {
  button.addEventListener("click", () => switchMode(button.dataset.switch));
});

document.querySelectorAll("[data-toggle]").forEach(button => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.toggle);
    input.type = input.type === "password" ? "text" : "password";
    button.textContent = input.type === "password" ? "Show" : "Hide";
  });
});

async function request(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed (${response.status})`);
  }

  return data;
}

signinForm.addEventListener("submit", async event => {
  event.preventDefault();

  const button = signinForm.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = "Signing in...";

  try {
    const result = await request("/auth/login", {
      email: signinForm.elements.email.value.trim(),
      password: signinForm.elements.password.value
    });

    if (!result.token || !result.user) {
      throw new Error("The authentication API did not return a token and user.");
    }

    const store = document.getElementById("remember").checked
      ? localStorage
      : sessionStorage;

    ["borrowbox_token", "borrowbox_user"].forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    store.setItem("borrowbox_token", result.token);
    store.setItem("borrowbox_user", JSON.stringify(result.user));

    window.location.href = "index.html";
  } catch (error) {
    message(
      error instanceof TypeError
        ? "Cannot reach the BorrowBox API. Check the backend URL, server status, and CORS settings."
        : error.message
    );
  } finally {
    button.disabled = false;
    button.innerHTML = 'Sign in <span>→</span>';
  }
});

signupForm.addEventListener("submit", async event => {
  event.preventDefault();

  const password = signupForm.elements.password.value;

  if (password !== signupForm.elements.confirm_password.value) {
    return message("Your passwords do not match.");
  }

  if (password.length < 8) {
    return message("Use a password with at least 8 characters.");
  }

  const button = signupForm.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = "Creating account...";

  try {
    const result = await request("/auth/register", {
      full_name: signupForm.elements.full_name.value.trim(),
      email: signupForm.elements.email.value.trim(),
      role: signupForm.elements.role.value,
      password
    });

    signupForm.reset();
    switchMode("signin");
    message(result.message || "Account created. You can now sign in.", "success");
  } catch (error) {
    message(
      error instanceof TypeError
        ? "Cannot reach the BorrowBox API. Check the backend URL, server status, and CORS settings."
        : error.message
    );
  } finally {
    button.disabled = false;
    button.innerHTML = 'Create account <span>→</span>';
  }
});

// If a saved token exists, let the backend validate it before redirecting.
async function checkExistingSession() {
  const token =
    localStorage.getItem("borrowbox_token") ||
    sessionStorage.getItem("borrowbox_token");

  if (!token) return;

  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.ok) {
      window.location.replace("index.html");
      return;
    }
  } catch (_) {
    // Keep the login page available if the API is temporarily unreachable.
  }

  localStorage.removeItem("borrowbox_token");
  localStorage.removeItem("borrowbox_user");
  sessionStorage.removeItem("borrowbox_token");
  sessionStorage.removeItem("borrowbox_user");
}

checkExistingSession();
