const express = require("express");
const { httpError } = require("../lib/errors");
const router = express.Router();

const notBuilt = (req, res, next) => next(httpError(501, "Not built yet."));

// ONLINE data, converted to our own shape by the adapters in /providers
router.get("/home", notBuilt);                    // popular movies, series and anime for the main page
router.get("/search", notBuilt);                  // ?q=&type=&genre=&rating=  asks every adapter at once (Aggregator)
router.get("/:source/:id", notBuilt);             // one title, plus watchLinks from data/watch-links.json
router.get("/:source/:id/similar", notBuilt);     // other titles with the same genres

module.exports = router;
