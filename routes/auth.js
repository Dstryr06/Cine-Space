const express = require("express");
const { httpError } = require("../lib/errors");
const router = express.Router();

const notBuilt = (req, res, next) => next(httpError(501, "Not built yet."));

// TODO: store users in data/users.json with HASHED passwords; return { token } on success
router.post("/register", notBuilt);   // { username, password } -> 201
router.post("/login", notBuilt);      // { username, password } -> 200 { token }
router.get("/me", notBuilt);          // who is logged in

module.exports = router;
