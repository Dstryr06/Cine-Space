// Reads and writes the local JSON files in /data (the team's own local data).
const fs = require("fs");
const path = require("path");
const { httpError } = require("./errors");

const file = name => path.join(__dirname, "..", "data", name);

function read(name) {
  try { return JSON.parse(fs.readFileSync(file(name), "utf8")); }
  catch (e) { throw httpError(500, `Unable to read ${name}.`); }
}

function write(name, data) {
  try { fs.writeFileSync(file(name), JSON.stringify(data, null, 2)); }
  catch (e) { throw httpError(500, `Unable to save ${name}.`); }
}

module.exports = { read, write };
