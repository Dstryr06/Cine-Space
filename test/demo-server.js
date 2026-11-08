// `npm run demo`: runs the real app on port 3200 with FAKE online services and generated poster art,
// so you can click around without internet or API keys. Data is kept in a temp folder, not in /data.
const fs = require("fs"), os = require("os"), path = require("path"), express = require("express");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cinespace-demo-"));
Object.assign(process.env, { DATA_DIR: dir, LOG_FILE: "off", TMDB_TOKEN: "demo", WATCH_REGION: "PH" });

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "catalog.json"), "utf8"));
const hue = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
catalog.forEach((t, i) => { t.posterUrl = `/demo-art/${encodeURIComponent(t.title)}.svg`; if (i % 3 === 0 && t.score >= 7.5) t.backdropUrl = `/demo-art/${encodeURIComponent(t.title)}.svg?wide=1`; });
fs.writeFileSync(path.join(dir, "catalog.json"), JSON.stringify(catalog));

require("./mockFetch").install();
const outer = express();
outer.get("/demo-art/:name.svg", (req, res) => {
  const t = decodeURIComponent(req.params.name), h = hue(t), wide = "wide" in req.query;
  const w = wide ? 1280 : 400, hh = wide ? 560 : 600;
  res.type("image/svg+xml").send(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},60%,38%)"/><stop offset="1" stop-color="hsl(${(h + 60) % 360},65%,18%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * .7}" cy="${hh * .35}" r="${hh * .28}" fill="hsl(${h},70%,60%)" opacity=".35"/></svg>`);
});
outer.use(require("../server").createApp());
const port = Number(process.env.PORT) || 3200;
outer.listen(port, () => console.log(`Cine Space DEMO (fake services) at http://localhost:${port}`));
