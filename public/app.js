// ============================================================
// app.js — Frontend logic
// Supports up to 3 concurrent image uploads + resizing
// ============================================================

const MAX_FILES   = 3;   // maximum simultaneous uploads
let   allResults  = [];  // stores every generated file across all uploads

async function submitForm() {
  const btn      = document.getElementById('submitBtn');
  const dlBtn    = document.getElementById('downloadAllBtn');
  const statusEl = document.getElementById('status');
  const resultsEl= document.getElementById('results');
  // Collect whichever of the 3 inputs have a file selected
  const files = [
    document.getElementById('imageInput1').files[0],
    document.getElementById('imageInput2').files[0],
    document.getElementById('imageInput3').files[0],
  ].filter(Boolean); // remove empty slots
  const prompt   = document.getElementById('brandPrompt').value.trim();

  // ── Gather selected ratios ───────────────────────────────
  const selectedRatios = Array.from(
    document.querySelectorAll('input[name="ratio"]:checked')
  ).map(cb => cb.value);

  // ── Validation ───────────────────────────────────────────
  if (files.length === 0) {
    statusEl.textContent = 'Please upload at least one image.';
    return;
  }
  if (selectedRatios.length === 0) {
    statusEl.textContent = 'Please select at least one output size.';
    return;
  }

  // ── Reset UI ─────────────────────────────────────────────
  btn.disabled         = true;
  btn.textContent      = 'Processing…';
  dlBtn.style.display  = 'none';
  resultsEl.innerHTML  = '';
  allResults           = [];

  // Create a placeholder section for each image immediately
  // so the user can see all jobs started at once
  const groups = files.map((file, i) => {
    const group = document.createElement('div');
    group.className = 'image-group';
    group.id        = `group-${i}`;

    const title = document.createElement('div');
    title.className   = 'image-group-title';
    title.textContent = `📷 ${file.name}`;

    const status = document.createElement('div');
    status.id        = `group-status-${i}`;
    status.style     = 'font-size:0.85rem;color:#888;padding:8px 0;';
    status.textContent = 'Sending to Stability AI…';

    group.appendChild(title);
    group.appendChild(status);
    resultsEl.appendChild(group);

    return { group, status };
  });

  statusEl.textContent = `Processing ${files.length} image${files.length > 1 ? 's' : ''} in parallel…`;

  // ── Process all files concurrently ───────────────────────
  const jobs = files.map((file, i) => processFile(file, selectedRatios, prompt, groups[i]));
  const outcomes = await Promise.allSettled(jobs);

  // ── Summary ──────────────────────────────────────────────
  const succeeded = outcomes.filter(o => o.status === 'fulfilled').length;
  const failed    = outcomes.filter(o => o.status === 'rejected').length;

  if (failed === 0) {
    statusEl.textContent = `✓ All ${succeeded} image${succeeded > 1 ? 's' : ''} done!`;
  } else {
    statusEl.textContent = `${succeeded} succeeded, ${failed} failed. Check results below.`;
  }

  // Show Download All if we have more than one output file total
  if (allResults.length > 1) {
    dlBtn.style.display = 'block';
  }

  btn.disabled    = false;
  btn.textContent = 'Resize with AI';
}

// ── Process a single file and render its results ─────────────
async function processFile(file, selectedRatios, brandPrompt, { group, status }) {
  const formData = new FormData();
  formData.append('image',       file);
  formData.append('ratios',      JSON.stringify(selectedRatios));
  formData.append('brandPrompt', brandPrompt);

  try {
    const response = await fetch('/api/resize', { method: 'POST', body: formData });
    const data     = await response.json();

    if (!response.ok || data.error) throw new Error(data.error || 'Server error');

    // Store results globally for Download All
    allResults.push(...data.results);

    // Update this group's status
    status.textContent = `✓ ${data.results.length} size${data.results.length > 1 ? 's' : ''} generated`;
    status.style.color = '#1a6b3a';

    // Render each resized image inside this group
    data.results.forEach(result => {
      const item = document.createElement('div');
      item.className = 'result-item';

      const label = document.createElement('div');
      label.className   = 'result-label';
      label.textContent = `${result.ratio} — ${result.width} × ${result.height}px`;

      const img = document.createElement('img');
      img.src   = `/outputs/${result.filename}`;
      img.alt   = `Resized ${result.ratio}`;

      const link       = document.createElement('a');
      link.href        = img.src;
      link.download    = result.filename;
      link.textContent = 'Download';
      link.style       = 'display:block; padding:8px 12px; font-size:0.85rem; color:#0066cc;';

      item.appendChild(label);
      item.appendChild(img);
      item.appendChild(link);
      group.appendChild(item);
    });

  } catch (err) {
    status.textContent = `✗ Error: ${err.message}`;
    status.style.color = '#cc0000';
    throw err;
  }
}

// ── Download All as ZIP ──────────────────────────────────────
async function downloadAll() {
  const dlBtn    = document.getElementById('downloadAllBtn');
  const statusEl = document.getElementById('status');

  if (!allResults.length) return;

  dlBtn.disabled    = true;
  dlBtn.textContent = 'Creating ZIP…';
  statusEl.textContent = 'Bundling all images into ZIP…';

  try {
    const zip = new JSZip();

    for (const result of allResults) {
      const response = await fetch(`/outputs/${result.filename}`);
      const blob     = await response.blob();
      zip.file(result.filename, blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url     = URL.createObjectURL(zipBlob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = 'creative-resizer-outputs.zip';
    a.click();
    URL.revokeObjectURL(url);

    statusEl.textContent = `ZIP downloaded — ${allResults.length} files included.`;

  } catch (err) {
    statusEl.textContent = `ZIP error: ${err.message}`;
    console.error(err);
  } finally {
    dlBtn.disabled    = false;
    dlBtn.textContent = 'Download All as ZIP';
  }
}
