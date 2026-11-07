/**
 * =============================================================================
 * CINE SPACE - LOGIN & REGISTRATION CONTROLLER
 * =============================================================================
 * Handles user authentication (login/register), time-aware dynamic greetings,
 * live password policy checks, and server error handling.
 */

import { api, $, icon, themeButton, isLoggedIn, TOKEN_KEY, USER_KEY, alertHtml, LOGO, esc } from "../app.js";

// -----------------------------------------------------------------------------
// 1. NAVIGATION & AUTHENTICATION GUARD
// -----------------------------------------------------------------------------
// Target page after successful authentication
const next = (() => { 
  const n = new URLSearchParams(location.search).get("next") || ""; 
  return /^[\w.-]+\.html(\?[\w=&%.\-]*)?$/.test(n) ? n : "index.html"; 
})();

// Redirect to destination if user is already logged in
if (isLoggedIn()) location.replace(next);

// Shared password policy validator (client & server share rules)
const Policy = window.PasswordPolicy;

// Page mode state: 'login' or 'register'
let mode = new URLSearchParams(location.search).get("mode") === "register" ? "register" : "login";

// -----------------------------------------------------------------------------
// 2. TIME-AWARE & PERSONALIZED GREETING CONFIGURATION
// -----------------------------------------------------------------------------
/**
 * Configuration dictionary for dynamic time-based greetings.
 * Easy to customize hours, titles, and subtitles.
 */
const GREETING_CONFIG = {
  USER_STORAGE_KEY: USER_KEY,
  SLOTS: [
    { min: 5,  max: 12, title: "Good morning",          subtitle: "Starting the day with an episode?" },
    { min: 12, max: 17, title: "Taking a break?",        subtitle: "Your watchlists are right where you left them." },
    { min: 17, max: 22, title: "Unwinding for the night?", subtitle: "Grab your popcorn. Your seat is saved." },
    { min: 22, max: 5,  title: "Late-night binge?",      subtitle: "We won't judge. Ready to log your latest watch?" }
  ]
};

/**
 * Computes the time-aware title and subtitle for returning or new users.
 * @returns {{ title: string, subtitle: string }}
 */
function getGreeting() {
  const currentHour = new Date().getHours();
  
  // Find current active time slot
  const slot = GREETING_CONFIG.SLOTS.find(s => {
    return s.min < s.max ? (currentHour >= s.min && currentHour < s.max) : (currentHour >= s.min || currentHour < s.max);
  }) || GREETING_CONFIG.SLOTS[0];

  // Retrieve saved username if available in localStorage
  let savedUser = null;
  try {
    savedUser = localStorage.getItem(GREETING_CONFIG.USER_STORAGE_KEY);
  } catch (err) {
    // Graceful fallback if localStorage is disabled
  }

  // Personalize title if user was previously recognized on this device
  const title = savedUser ? `${slot.title}, ${savedUser}.` : `${slot.title}.`;
  
  return {
    title,
    subtitle: slot.subtitle
  };
}

// -----------------------------------------------------------------------------
// 3. UI RENDERING & FORM MANAGEMENT
// -----------------------------------------------------------------------------
/**
 * Renders the authentication card view based on active mode ('login' | 'register').
 */
function render() {
  const login = mode === "login";
  const greeting = getGreeting();

  // Dynamic header copy
  const headingText = login ? greeting.title : "Create your account";
  const subheadText = login ? greeting.subtitle : "Save what you want to watch and track every episode.";

  $("#authCard").innerHTML = `
    <div class="auth-brand">${LOGO}Cine Space</div>
    <h1 id="greeting-title">${headingText}</h1>
    <p class="sub" id="greeting-subtitle">${subheadText}</p>

    <div id="authMsg" aria-live="polite"></div>

    <form id="authForm" novalidate>
      <div class="field">
        <label for="user">Username</label>
        <input class="input" id="user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required aria-describedby="userErr" ${login ? "" : 'placeholder="3 to 20 letters, numbers or _"'} autofocus>
        <span class="field-error" id="userErr" role="alert"></span>
      </div>

      <div class="field">
        <label for="pass">Password</label>
        <div class="pw">
          <input class="input" id="pass" name="password" type="password" autocomplete="${login ? "current-password" : "new-password"}" required aria-describedby="${login ? "passErr" : "passErr rules"}">
          <button type="button" id="showPw" aria-label="Show password" aria-pressed="false">${icon("eye")}</button>
        </div>
        <span class="field-error" id="passErr" role="alert"></span>
        ${login ? "" : `<ul class="rules" id="rules" aria-label="Password rules"></ul>`}
      </div>

      <button class="btn btn-primary btn-block" id="submitBtn" type="submit">
        ${login ? "Log in" : "Create account"}
      </button>
    </form>

    <p class="auth-switch">
      ${login ? "New to Cine Space?" : "Already have an account?"} 
      <button class="link-btn" type="button" id="switchMode">${login ? "Create an account" : "Log in"}</button>
    </p>`;

  // Attach event listeners
  $("#switchMode").addEventListener("click", () => { 
    mode = login ? "register" : "login"; 
    render(); 
  });

  $("#showPw").addEventListener("click", e => {
    const input = $("#pass");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    e.currentTarget.innerHTML = icon(show ? "eyeOff" : "eye");
    e.currentTarget.setAttribute("aria-pressed", String(show));
    e.currentTarget.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });

  $("#authForm").addEventListener("submit", submit);

  if (!login) { 
    $("#pass").addEventListener("input", drawRules); 
    $("#user").addEventListener("input", () => { drawRules(); fieldError("user", ""); }); 
    drawRules(); 
  } else { 
    $("#user").addEventListener("input", () => fieldError("user", "")); 
    $("#pass").addEventListener("input", () => fieldError("pass", "")); 
  }
}

// -----------------------------------------------------------------------------
// 4. LIVE VALIDATION & ERROR HELPERS
// -----------------------------------------------------------------------------
/**
 * Renders interactive password rules checklist during registration.
 */
function drawRules() {
  const pw = $("#pass").value;
  const r = Policy.check(pw, { username: $("#user").value.trim() });
  
  $("#rules").innerHTML = r.results.filter(x => x.always || (pw && !x.ok)).map(x => {
    const state = !pw ? "" : x.ok ? "ok" : (x.always ? "" : "bad");
    return `<li class="${state}">
      ${icon(x.ok && pw ? "check" : "dot")}
      <span>${esc(x.label)}</span>
      <span class="sr-only">${pw ? (x.ok ? ", met" : ", not met") : ""}</span>
    </li>`;
  }).join("");
}

/**
 * Displays or clears field-specific validation error messages.
 */
function fieldError(name, msg) {
  const el = $(`#${name}Err`);
  const input = $(name === "user" ? "#user" : "#pass");
  if (el) el.textContent = msg || "";
  if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
}

// -----------------------------------------------------------------------------
// 5. FORM SUBMISSION HANDLER
// -----------------------------------------------------------------------------
async function submit(e) {
  e.preventDefault();
  const username = $("#user").value.trim();
  const password = $("#pass").value;
  const msg = $("#authMsg");
  const btn = $("#submitBtn");

  msg.innerHTML = ""; 
  fieldError("user", ""); 
  fieldError("pass", "");

  let bad = false;
  if (!username) { fieldError("user", "Enter your username."); bad = true; }
  if (!password) { fieldError("pass", "Enter your password."); bad = true; }
  
  if (mode === "register") {
    if (username && !/^[A-Za-z0-9_]{3,20}$/.test(username)) { 
      fieldError("user", "Username must be 3 to 20 letters, numbers or underscores."); 
      bad = true; 
    }
    const r = Policy.check(password, { username });
    if (password && !r.ok) { 
      fieldError("pass", r.messages[0]); 
      bad = true; 
    }
  }

  if (bad) { 
    (($("#user").getAttribute("aria-invalid") === "true") ? $("#user") : $("#pass")).focus(); 
    return; 
  }

  btn.disabled = true; 
  btn.textContent = mode === "login" ? "Logging in…" : "Creating account…";

  try {
    const r = await api(`/api/auth/${mode}`, { method: "POST", body: { username, password } });
    localStorage.setItem(TOKEN_KEY, r.token); 
    localStorage.setItem(USER_KEY, r.username);
    location.href = next;
  } catch (err) {
    const f = err.fields || {};
    if (f.username || f.password) {
      if (f.username) fieldError("user", f.username);
      if (f.password) fieldError("pass", f.password);
      (f.username ? $("#user") : $("#pass")).focus();
    } else {
      msg.innerHTML = alertHtml("error", err.errors || err.message, false);
    }
    btn.disabled = false; 
    btn.textContent = mode === "login" ? "Log in" : "Create account";
  }
}

// -----------------------------------------------------------------------------
// 6. INITIALIZATION
// -----------------------------------------------------------------------------
$("#themeSlot").innerHTML = themeButton();
render();
