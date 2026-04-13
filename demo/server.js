const path = require("path");
const express = require("express");
const multer = require("multer");
const archiver = require("archiver");
const GraphicsMagick = require("gm");

const { transform } = require("../lib/transform");

const app = express();

const gm = GraphicsMagick.subClass({ imageMagick: true });

// Store uploads in memory; stream straight into ImageMagick.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.use(express.static(path.join(__dirname, "public")));

const OUTPUT_SIZES = {
  "1:1": { id: "1:1", label: "1:1 Square", width: 1080, height: 1080 },
  "4:5": { id: "4:5", label: "4:5 Portrait", width: 1080, height: 1350 },
  "9:16": { id: "9:16", label: "9:16 Story", width: 1080, height: 1920 },
  "16:9": { id: "16:9", label: "16:9 Landscape", width: 1920, height: 1080 },
};

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function safeBaseName(name) {
  return String(name || "image")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "image";
}

function gmToBuffer(state, format) {
  return new Promise((resolve, reject) => {
    state.toBuffer(format, (err, buf) => {
      if (err) reject(err);
      else resolve(buf);
    });
  });
}

async function resizeWithBlurFill(buffer, width, height) {
  // 1) Create a background that fills the frame, then blur it.
  const bg = gm(buffer)
    .autoOrient()
    .filter("lanczos")
    .resize(width, height, "^")
    .gravity("Center")
    .extent(width, height)
    .blur(0, 28);

  // 2) Create a foreground that fits entirely inside the frame (no crop).
  // Use PNG to preserve transparency for compositing.
  const fgPng = await gmToBuffer(
    gm(buffer)
      .autoOrient()
      .filter("lanczos")
      .resize(width, height)
      .background("transparent")
      .gravity("Center")
      .extent(width, height)
      .unsharp(0, 1.0, 0.9, 0.03),
    "PNG",
  );

  // 3) Composite the foreground over the blurred background.
  return gmToBuffer(
    bg
      .composite(fgPng)
      .compose("Over")
      .gravity("Center")
      .unsharp(0, 1.0, 0.6, 0.02)
      .quality(95),
    "JPG",
  );
}

async function resizeFill(buffer, width, height) {
  // Fill the frame fully. This can crop; use North gravity so top text is preserved.
  return gmToBuffer(
    gm(buffer)
      .autoOrient()
      .filter("lanczos")
      .resize(width, height, "^")
      .gravity("Center")
      .extent(width, height)
      .unsharp(0, 1.0, 0.8, 0.03)
      .quality(95),
    "JPG",
  );
}

async function resizeStretch(buffer, width, height) {
  // Exact frame, no crop: distort/compress to fit exactly.
  return gmToBuffer(
    gm(buffer)
      .autoOrient()
      .filter("lanczos")
      .resize(width, height, "!")
      .unsharp(0, 1.0, 0.75, 0.03)
      .quality(95),
    "JPG",
  );
}

app.post(
  "/api/resize",
  upload.fields([
    { name: "image1", maxCount: 1 },
    { name: "image2", maxCount: 1 },
    { name: "image3", maxCount: 1 },
  ]),
  async (req, res) => {
  try {
    const files = [
      ...(req.files?.image1 || []),
      ...(req.files?.image2 || []),
      ...(req.files?.image3 || []),
    ];

    if (!files.length) {
      res.status(400).json({ error: "Please upload at least 1 image." });
      return;
    }

    const raw = req.body.sizes;
    const sizes = (Array.isArray(raw) ? raw : raw ? [raw] : [])
      .map((x) => String(x))
      .filter((x) => OUTPUT_SIZES[x]);

    if (!sizes.length) {
      res.status(400).json({ error: "Please select at least 1 output size." });
      return;
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="resized-images.zip"',
    );
    res.setHeader("Cache-Control", "no-store");

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      throw err;
    });
    archive.pipe(res);

    const instructions = req.body.instructions ? String(req.body.instructions) : "";
    if (instructions.trim()) {
      archive.append(instructions.trim() + "\n", { name: "instructions.txt" });
    }

    // Hardcoded: always "stretch" (exact frame, no crop).
    const layout = "stretch";

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const base = safeBaseName(file.originalname || `image_${i + 1}`);

      for (const sizeId of sizes) {
        const preset = OUTPUT_SIZES[sizeId];
        let buf;
        if (layout === "fit") {
          const imageStream = require("stream").Readable.from(file.buffer);
          const transforms = [{ width: preset.width, height: preset.height, crop: "fit" }];
          const outStream = await new Promise((resolve, reject) => {
            transform(imageStream, transforms).stream((err, out) => {
              if (err) reject(err);
              else resolve(out);
            });
          });
          buf = await streamToBuffer(outStream);
        } else if (layout === "blur") {
          buf = await resizeWithBlurFill(file.buffer, preset.width, preset.height);
        } else if (layout === "stretch") {
          buf = await resizeStretch(file.buffer, preset.width, preset.height);
        } else {
          buf = await resizeFill(file.buffer, preset.width, preset.height);
        }

        const filename = `${base}__${preset.id.replace(":", "x")}__${preset.width}x${preset.height}.jpg`;
        archive.append(buf, { name: filename });
      }
    }

    await archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Demo running at http://0.0.0.0:${port}`);
});

