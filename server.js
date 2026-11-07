require("dotenv").config();
const express = require("express");
const path = require("path");
const { httpError } = require("./lib/errors");
const requestLogger = require("./middleware/requestLogger");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "100kb" }));
app.use(requestLogger);
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => res.json({ ok: true, service: "cine-space" }));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/catalog", require("./routes/catalog"));
app.use("/api/watchlist", require("./routes/watchlist"));
app.use("/api/random", require("./routes/random"));

app.use((req, res, next) => next(httpError(404, `Route ${req.method} ${req.originalUrl} was not found.`)));

// every error leaves the API in the same shape: { "errors": ["..."] }
app.use((err, req, res, next) => {
  console.error(`[${req.id}] ${err.message}`);
  res.status(err.status || 500).json({ errors: err.errors || [err.message || "Internal Server Error"] });
});

app.listen(PORT, () => console.log(`Cine-Space running at http://localhost:${PORT}`));