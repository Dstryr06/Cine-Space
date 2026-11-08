// Reads and writes the local JSON files in /data (the app's own local database).
// Writes are atomic (temp file + rename) so a crash can never leave a half-written file.
const fs = require("fs");
const path = require("path");
const { httpError } = require("./errors");

const dir = () => process.env.DATA_DIR || path.join(__dirname, "..", "data");
const file = name => path.join(dir(), name);

// fresh parse every time: use this for data you are going to change and write back
function read(name, fallback = []) {
  try { return JSON.parse(fs.readFileSync(file(name), "utf8")); }
  catch (e) {
    if (e.code === "ENOENT") return JSON.parse(JSON.stringify(fallback));
    throw httpError(500, `Unable to read ${name}.`);
  }
}

// parsed once per file change (mtime): use this for big read-only data such as the catalog
const cache = new Map();
function readCached(name, fallback = []) {
  try {
    const mtime = fs.statSync(file(name)).mtimeMs;
    const hit = cache.get(name);
    if (hit && hit.mtime === mtime) return hit.data;
    const data = JSON.parse(fs.readFileSync(file(name), "utf8"));
    cache.set(name, { mtime, data });
    return data;
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw httpError(500, `Unable to read ${name}.`);
  }
}

function write(name, data) {
  const target = file(name), tmp = `${target}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, target);
    cache.delete(name);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (err) { /* nothing to clean */ }
    throw httpError(500, `Unable to save ${name}.`);
  }
}

module.exports = { read, readCached, write, dir };
