// Password rules. ONE file used by both sides: the server (routes/auth.js) enforces them,
// and the sign-up form (public/js/pages/login.js) shows them live while the user types.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PasswordPolicy = api;
})(typeof self !== "undefined" ? self : this, function () {
  const MIN_LENGTH = 10, MAX_LENGTH = 128;

  // Passwords people (and password-cracking lists) try first. Compared after removing digits, symbols and "leet" swaps,
  // so Password1!, P@ssw0rd and Qwerty#2024 are all rejected even though they look complex.
  const COMMON = ["password", "passwd", "pass", "qwerty", "qwertyuiop", "asdfgh", "asdfghjkl", "zxcvbn", "zxcvbnm", "letmein", "welcome",
    "admin", "administrator", "login", "iloveyou", "monkey", "dragon", "football", "baseball", "superman", "batman", "master", "shadow",
    "sunshine", "princess", "trustno", "whatever", "freedom", "changeme", "default", "test", "tester", "user", "guest", "abc", "abcdef",
    "abcdefgh", "cinespace", "cinema", "movie", "movies", "netflix", "naruto", "pokemon", "starwars", "internet", "computer", "secret"];
  const LEET = { "@": "a", "4": "a", "0": "o", "1": "l", "3": "e", "$": "s", "5": "s", "7": "t" };

  function isCommon(pw) {
    const lower = pw.toLowerCase();
    const plain = lower.replace(/[^a-z]/g, "");                                            // Password1!  -> password
    const leet = lower.replace(/[^a-z]+$/, "").replace(/[@4013$57]/g, c => LEET[c]).replace(/[^a-z]/g, "");   // P@ssw0rd9 -> password
    return COMMON.includes(plain) || COMMON.includes(leet);
  }

  // always: shown in the checklist from the start. The others only appear when they are broken.
  const RULES = [
    { id: "length", always: true, label: `At least ${MIN_LENGTH} characters`, message: `Password must be at least ${MIN_LENGTH} characters.`, test: p => [...p].length >= MIN_LENGTH },
    { id: "lower", always: true, label: "A lowercase letter", message: "Password must include a lowercase letter.", test: p => /\p{Ll}/u.test(p) },
    { id: "upper", always: true, label: "An uppercase letter", message: "Password must include an uppercase letter.", test: p => /\p{Lu}/u.test(p) },
    { id: "number", always: true, label: "A number", message: "Password must include a number.", test: p => /\p{Nd}/u.test(p) },
    { id: "symbol", always: true, label: "A special character, like ! ? # $ %", message: "Password must include a special character such as ! ? # $ %.", test: p => /[^\p{L}\p{N}\s]/u.test(p) },
    { id: "username", always: false, label: "Doesn’t contain your username", message: "Password can’t contain your username.", test: (p, u) => !(u && u.length >= 3 && p.toLowerCase().includes(u.toLowerCase())) },
    { id: "common", always: false, label: "Not a commonly used password", message: "That password is too common. Choose one that is harder to guess.", test: p => !isCommon(p) }
  ];

  // check("abc", { username: "rica" }) -> { ok, results: [{ id, label, message, always, ok }], messages: ["..."] }
  function check(password, { username = "" } = {}) {
    const pw = typeof password === "string" ? password : "";
    const results = RULES.map(r => ({ id: r.id, label: r.label, message: r.message, always: r.always, ok: r.test(pw, String(username || "")) }));
    const messages = results.filter(r => !r.ok).map(r => r.message);
    if ([...pw].length > MAX_LENGTH) messages.push(`Password must be ${MAX_LENGTH} characters or fewer.`);
    return { ok: messages.length === 0, results, messages };
  }

  return { MIN_LENGTH, MAX_LENGTH, check };
});
