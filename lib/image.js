// Reads the type and pixel size of an uploaded poster straight from the file's bytes (no image library needed).
// The type is decided by the file's own signature, never by its name or the Content-Type the browser sent,
// so a renamed .exe or an SVG with a script inside is simply "not an image".
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const POSTER = {
  maxBytes: 8 * 1024 * 1024,
  minWidth: 600, minHeight: 900,            // sharp on retina screens at the largest size the app draws a poster
  minRatio: 0.6, maxRatio: 0.75,            // portrait, about 2:3 (width / height)
    recommended: "1000 × 1500 px or larger"
};

function pngSize(b) {
    if (b.length < 24 || !b.subarray(0, 8).equals(PNG_SIGNATURE) || b.toString("ascii", 12, 16) !== "IHDR") return null;
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

// phones store portrait photos sideways and add an "orientation" tag; browsers honour it, so we do too
function exifOrientation(b, start, end) {
    try {
    const order = b.toString("ascii", start, start + 2);
    if (order !== "II" && order !== "MM") return 1;
    const le = order === "II";
    const u16 = o => (le ? b.readUInt16LE(o) : b.readUInt16BE(o)), u32 = o => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
    if (u16(start + 2) !== 42) return 1;
    const ifd = start + u32(start + 4);
    const count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
        if (entry + 12 > end) break;
        if (u16(entry) === 0x0112) return u16(entry + 8) || 1;
    }
  } catch (e) { /* unreadable tag: assume upright */ }
    return 1;
}

function jpegSize(b) {
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
    let i = 2, orientation = 1;
    while (i + 4 <= b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = b.readUInt16BE(i + 2);
    if (len < 2) return null;
    if (marker === 0xe1 && b.toString("latin1", i + 4, i + 10) === "Exif\0\0") orientation = exifOrientation(b, i + 10, i + 2 + len);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (i + 9 > b.length) return null;
        const height = b.readUInt16BE(i + 5), width = b.readUInt16BE(i + 7);
        return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
    }
    i += 2 + len;
    }
    return null;
}

function webpSize(b) {
    if (b.length < 30 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8 ") return b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a ? { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff } : null;
    if (kind === "VP8L") { if (b[20] !== 0x2f) return null; const bits = b.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; }
    if (kind === "VP8X") return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
    return null;
}

// -> { type: "png" | "jpeg" | "webp", ext, mime, width, height } or null when the bytes are not one of the three
function inspect(buffer) {
    if (!Buffer.isBuffer(buffer)) return null;
    const found = [["png", "png", "image/png", pngSize], ["jpeg", "jpg", "image/jpeg", jpegSize], ["webp", "webp", "image/webp", webpSize]];
    for (const [type, ext, mime, read] of found) {
    let size = null;
    try { size = read(buffer); } catch (e) { size = null; }
    if (size && size.width > 0 && size.height > 0) return { type, ext, mime, ...size };
    }
    return null;
}

// returns a list of problems that stop this image from being used as a poster (empty = good)
function posterProblems({ width, height }) {
    const out = [];
  const ratio = width / height;                               // shape first: a landscape picture is the more useful thing to hear about
    if (ratio < POSTER.minRatio || ratio > POSTER.maxRatio) out.push(`The image is ${width} × ${height} px. Posters are portrait, about 2:3 (for example 1000 × 1500), so nothing gets cropped.`);
    if (width < POSTER.minWidth || height < POSTER.minHeight) out.push(`The image is ${width} × ${height} px. Use at least ${POSTER.minWidth} × ${POSTER.minHeight} px so it stays sharp (${POSTER.recommended} is ideal).`);
    return out;
}

module.exports = { POSTER, inspect, posterProblems };