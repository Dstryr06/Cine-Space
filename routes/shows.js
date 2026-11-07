// TV shows the user adds by hand (for titles the online catalog doesn't have): create, read, edit, delete, plus the poster image.
//   GET    /api/shows/options     genres, statuses and the poster rules (so the form never hard-codes them)
//   GET    /api/shows             my shows
//   POST   /api/shows             add a show                  { title, year?, showStatus?, genres?, synopsis?, seasons? }
//   GET    /api/shows/:id         one show
//   PUT    /api/shows/:id         edit a show (same body)
//   DELETE /api/shows/:id         delete the show, its poster, and its entry in my library
//   PUT    /api/shows/:id/poster  upload the poster: the raw image bytes with Content-Type image/jpeg | image/png | image/webp
//   DELETE /api/shows/:id/poster  remove the poster
const express = require("express");
const { httpError } = require("../lib/errors");
const custom = require("../lib/custom");
const { POSTER } = require("../lib/image");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

router.use(requireAuth);

const view = record => custom.toMedia(record);

router.get("/options", (req, res) => res.json({ data: custom.options() }));

router.get("/", (req, res, next) => { try { res.json({ data: custom.mediaList(req.user.id) }); } catch (e) { next(e); } });

router.post("/", (req, res, next) => { try {
  const record = custom.create(req.user.id, req.body);
  res.status(201).json({ message: "Show added.", data: view(record) });
} catch (e) { next(e); } });

router.get("/:id", (req, res, next) => { try {
  const record = custom.find(req.user.id, req.params.id);
  if (!record) throw httpError(404, "Show not found.");
  res.json({ data: view(record) });
} catch (e) { next(e); } });

router.put("/:id", (req, res, next) => { try {
  res.json({ message: "Show updated.", data: view(custom.update(req.user.id, req.params.id, req.body)) });
} catch (e) { next(e); } });

router.delete("/:id", (req, res, next) => { try {
  const { record, removedFromLibrary } = custom.remove(req.user.id, req.params.id);
  res.json({ message: "Show deleted.", data: { id: record.id, title: record.title, removedFromLibrary } });
} catch (e) { next(e); } });

// the image arrives as raw bytes, so there is no extra upload library and no base64 bloat
const rawImage = express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: POSTER.maxBytes });

router.put("/:id/poster", rawImage, (req, res, next) => { try {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw httpError(415, "Unsupported image.", ["Upload a JPG, PNG or WebP image."], { poster: "Upload a JPG, PNG or WebP image." });
  const { record, info } = custom.setPoster(req.user.id, req.params.id, req.body);
  res.json({ message: "Poster saved.", data: view(record), poster: { width: info.width, height: info.height, type: info.type } });
} catch (e) { next(e); } });

router.delete("/:id/poster", (req, res, next) => { try {
  res.json({ message: "Poster removed.", data: view(custom.clearPoster(req.user.id, req.params.id)) });
} catch (e) { next(e); } });

router.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") return next(httpError(413, "Image too large.", [`That image is over ${POSTER.maxBytes / 1024 / 1024} MB. Choose a smaller file.`], { poster: `That image is over ${POSTER.maxBytes / 1024 / 1024} MB. Choose a smaller file.` }));
  next(err);
});

module.exports = router;
