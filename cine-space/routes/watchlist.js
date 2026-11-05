const express = require("express");
const { httpError } = require("../lib/errors");
const router = express.Router();

const notBuilt = (req, res, next) => next(httpError(501, "Not built yet."));

// LOCAL data (data/watchlist.json), one user's entries only. Needs the login check first.
// Entry: { id, userId, key, title, type, episodes, episodeProgress, favorite, status, addedAt }
router.get("/", notBuilt);          // ?tab=favorites|watched|unwatched
router.post("/", notBuilt);         // { source, id }: verify the title online, then save locally (integration workflow)
router.patch("/:id", notBuilt);     // { favorite, status, episodeProgress }
router.delete("/:id", notBuilt);

module.exports = router;
