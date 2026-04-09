// ============================================================
// server.js — Creative Resizer Backend
// Uses Stability AI outpainting — purpose-built for extending images
// ============================================================

require('dotenv').config();

const express = require('express');
const multer  = require('multer');
const sharp   = require('sharp');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Serve static files from /public ─────────────────────────
app.use(express.static('public'));
app.use(express.json());

// ── Multer: store uploaded file in memory ────────────────────
const upload = multer({ storage: multer.memoryStorage() });

// ── Ensure /outputs folder exists ───────────────────────────
const outputsDir = path.join(__dirname, 'outputs');
if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir);

// ── Aspect ratio definitions (width : height) ────────────────
const RATIOS = {
  '1:1':  { w: 1,  h: 1  },
  '4:5':  { w: 4,  h: 5  },
  '9:16': { w: 9,  h: 16 },
  '16:9': { w: 16, h: 9  },
};

// ── Helper: work out target canvas size ─────────────────────
// Always EXTEND, never crop — keep the larger dimension intact.
function getTargetSize(origW, origH, ratioW, ratioH) {
  const currentAspect = origW / origH;
  const targetAspect  = ratioW / ratioH;
  if (currentAspect >= targetAspect) {
    // Wider than target → keep width, add height
    return { w: origW, h: Math.round(origW * ratioH / ratioW) };
  } else {
    // Taller than target → keep height, add width
    return { w: Math.round(origH * ratioW / ratioH), h: origH };
  }
}

// ── Stability AI outpainting call ───────────────────────────
// Sends the original image + how many pixels to extend in each direction.
// The AI understands the scene and fills the new areas intelligently.
async function callStabilityOutpaint(imageBuffer, padLeft, padRight, padTop, padBottom, userPrompt) {
  // Combine brand instructions with core outpainting guidance
  const prompt = [
    userPrompt,
    'Extend the background naturally. Preserve the main subject completely.',
    'Match existing lighting, colors, and perspective seamlessly.',
  ].filter(Boolean).join(' ');

  // Build multipart form (Node 18+ native FormData + Blob)
  const form = new FormData();
  form.append('image',         new Blob([imageBuffer], { type: 'image/jpeg' }), 'image.jpg');
  if (padLeft   > 0) form.append('left',   String(Math.round(padLeft)));
  if (padRight  > 0) form.append('right',  String(Math.round(padRight)));
  if (padTop    > 0) form.append('up',     String(Math.round(padTop)));
  if (padBottom > 0) form.append('bottom', String(Math.round(padBottom)));
  form.append('prompt',        prompt);
  form.append('creativity',    '0.35');   // 0 = very faithful, 1 = very creative
  form.append('output_format', 'jpeg');

  const response = await fetch('https://api.stability.ai/v2beta/stable-image/edit/outpaint', {
    method:  'POST',
    headers: {
      Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
      Accept:        'application/json',
    },
    body: form,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Stability AI error ${response.status}: ${err}`);
  }

  const data = await response.json();

  if (data.finish_reason && data.finish_reason !== 'SUCCESS') {
    throw new Error(`Stability AI returned: ${data.finish_reason}`);
  }

  return Buffer.from(data.image, 'base64');
}

// ── POST /api/resize ─────────────────────────────────────────
app.post('/api/resize', upload.single('image'), async (req, res) => {
  try {
    const selectedRatios = JSON.parse(req.body.ratios || '[]');
    const brandPrompt    = req.body.brandPrompt || '';

    if (!req.file)                      return res.status(400).json({ error: 'No image uploaded.' });
    if (!selectedRatios.length)         return res.status(400).json({ error: 'No ratios selected.' });
    if (!process.env.STABILITY_API_KEY) return res.status(500).json({ error: 'STABILITY_API_KEY is missing from your .env file.' });

    const originalBuffer = req.file.buffer;
    const { width: origW, height: origH } = await sharp(originalBuffer).metadata();

    // Resize to max 1440px on the longest side before sending to Stability AI.
    // Keeps processing fast and within API size limits.
    const MAX_SIDE   = 1440;
    const scale      = Math.min(1, MAX_SIDE / Math.max(origW, origH));
    const workW      = Math.round(origW * scale);
    const workH      = Math.round(origH * scale);
    const workBuffer = scale < 1
      ? await sharp(originalBuffer).resize(workW, workH).jpeg({ quality: 93 }).toBuffer()
      : originalBuffer;

    const results = [];

    for (const ratioKey of selectedRatios) {
      const ratio = RATIOS[ratioKey];
      if (!ratio) continue;

      // Calculate how many pixels to extend on each side
      const { w: newW, h: newH } = getTargetSize(workW, workH, ratio.w, ratio.h);
      const padLeft   = Math.floor((newW - workW) / 2);
      const padTop    = Math.floor((newH - workH) / 2);
      const padRight  = newW - workW - padLeft;
      const padBottom = newH - workH - padTop;

      console.log(`Processing ${ratioKey} (${newW}x${newH}) — extending L:${padLeft} R:${padRight} T:${padTop} B:${padBottom}…`);

      let resultBuffer;

      const needsExtension = padLeft > 0 || padRight > 0 || padTop > 0 || padBottom > 0;

      if (!needsExtension) {
        // Image already matches this ratio — no extension needed, save as-is
        console.log(`  ↳ Image already matches ${ratioKey}, saving original.`);
        resultBuffer = workBuffer;
      } else {
        // Call Stability AI — it handles scene understanding,
        // background generation, and seamless blending
        resultBuffer = await callStabilityOutpaint(
          workBuffer, padLeft, padRight, padTop, padBottom, brandPrompt
        );
      }

      // Save result
      const filename   = `output_${ratioKey.replace(':', 'x')}_${Date.now()}.jpg`;
      const outputPath = path.join(outputsDir, filename);
      fs.writeFileSync(outputPath, resultBuffer);

      results.push({ ratio: ratioKey, filename, width: newW, height: newH });
      console.log(`  ✓ Saved ${filename}`);
    }

    res.json({ success: true, results });

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Serve output images ──────────────────────────────────────
app.use('/outputs', express.static(outputsDir));

app.listen(PORT, () => {
  console.log(`Creative Resizer running at http://localhost:${PORT}`);
});
