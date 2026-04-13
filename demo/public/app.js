const image1El = document.getElementById("image1");
const image2El = document.getElementById("image2");
const image3El = document.getElementById("image3");
const instructionsEl = document.getElementById("instructions");
const submitEl = document.getElementById("submit");
const errorEl = document.getElementById("error");
const resultsEl = document.getElementById("results");
const outputsEl = document.getElementById("outputs");
const downloadZipEl = document.getElementById("downloadZip");

const sizeCheckboxes = Array.from(
  document.querySelectorAll('input[type="checkbox"][name="sizes"]'),
);

let zipBlob = null;
let zipUrl = null;
let outputUrls = [];

function mimeFromName(name) {
  const ext = String(name).split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "txt") return "text/plain";
  if (ext === "json") return "application/json";
  if (ext === "zip") return "application/zip";
  return "application/octet-stream";
}

function parseWxH(name) {
  // Matches "...__1080x1350.jpg"
  const m = String(name).match(/__([0-9]{2,5})x([0-9]{2,5})\.(?:png|jpe?g|webp|gif)$/i);
  if (!m) return null;
  const w = Number.parseInt(m[1], 10);
  const h = Number.parseInt(m[2], 10);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { w, h };
}

function setError(msg) {
  if (!msg) {
    errorEl.style.display = "none";
    errorEl.textContent = "";
    return;
  }
  errorEl.style.display = "block";
  errorEl.textContent = msg;
}

function cleanupOutputs() {
  if (zipUrl) URL.revokeObjectURL(zipUrl);
  zipUrl = null;
  zipBlob = null;

  for (const u of outputUrls) URL.revokeObjectURL(u);
  outputUrls = [];
  outputsEl.innerHTML = "";
  resultsEl.style.display = "none";
}

function canSubmit() {
  const files = [
    image1El.files && image1El.files[0],
    image2El.files && image2El.files[0],
    image3El.files && image3El.files[0],
  ].filter(Boolean);
  const hasSize = sizeCheckboxes.some((x) => x.checked);
  return files.length > 0 && hasSize;
}

function updateSubmitState() {
  submitEl.disabled = !canSubmit();
}

function onAnyInputChange() {
  setError("");
  cleanupOutputs();
  updateSubmitState();
}

image1El.addEventListener("change", onAnyInputChange);
image2El.addEventListener("change", onAnyInputChange);
image3El.addEventListener("change", onAnyInputChange);
instructionsEl.addEventListener("input", onAnyInputChange);
sizeCheckboxes.forEach((x) => x.addEventListener("change", onAnyInputChange));

submitEl.addEventListener("click", async () => {
  setError("");
  if (!canSubmit()) return;

  submitEl.disabled = true;
  submitEl.textContent = "Resizing…";

  try {
    const fd = new FormData();
    if (image1El.files && image1El.files[0]) fd.append("image1", image1El.files[0]);
    if (image2El.files && image2El.files[0]) fd.append("image2", image2El.files[0]);
    if (image3El.files && image3El.files[0]) fd.append("image3", image3El.files[0]);

    const selected = sizeCheckboxes.filter((x) => x.checked).map((x) => x.value);
    selected.forEach((s) => fd.append("sizes", s));

    const instructions = instructionsEl.value.trim();
    if (instructions) fd.append("instructions", instructions);

    const res = await fetch("/api/resize", { method: "POST", body: fd });
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        const data = await res.json();
        if (data && data.error) msg = data.error;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }

    zipBlob = await res.blob();
    zipUrl = URL.createObjectURL(zipBlob);

    downloadZipEl.onclick = () => {
      const a = document.createElement("a");
      a.href = zipUrl;
      a.download = "resized-images.zip";
      a.click();
    };

    const zip = await window.JSZip.loadAsync(zipBlob);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

    // Prefer showing images; still allow downloading any other files.
    const imageNames = names.filter((n) => /\.(png|jpe?g|webp|gif)$/i.test(n));
    const otherNames = names.filter((n) => !imageNames.includes(n));

    const allToShow = [...imageNames, ...otherNames];
    outputsEl.innerHTML = "";

    for (const name of allToShow) {
      const file = zip.file(name);
      if (!file) continue;

      const ext = name.split(".").pop()?.toLowerCase() || "";
      const isImage = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);

      const rawBlob = await file.async("blob");
      const typedBlob = new Blob([rawBlob], { type: mimeFromName(name) });
      const url = URL.createObjectURL(typedBlob);
      outputUrls.push(url);

      const item = document.createElement("div");
      item.className = "item";

      const header = document.createElement("header");
      const left = document.createElement("span");
      left.textContent = name;
      const right = document.createElement("span");
      right.textContent = `${Math.round(typedBlob.size / 1024)} KB`;
      header.appendChild(left);
      header.appendChild(right);

      item.appendChild(header);

      if (isImage) {
        const dims = parseWxH(name);
        const thumb = document.createElement("div");
        thumb.className = "thumb";
        if (dims) thumb.style.setProperty("--ar", `${dims.w} / ${dims.h}`);

        const img = document.createElement("img");
        img.alt = name;
        img.src = url;
        thumb.appendChild(img);
        item.appendChild(thumb);
      } else {
        const pre = document.createElement("div");
        pre.style.padding = "12px";
        pre.style.fontSize = "12px";
        pre.style.color = "var(--muted)";
        pre.textContent = "Non-image file";
        item.appendChild(pre);
      }

      const footer = document.createElement("footer");
      const dl = document.createElement("a");
      dl.className = "dl";
      dl.href = url;
      dl.download = name.split("/").pop();
      dl.textContent = "Download";
      footer.appendChild(dl);

      item.appendChild(footer);
      outputsEl.appendChild(item);
    }

    resultsEl.style.display = "block";
  } catch (e) {
    setError(e?.message || String(e));
  } finally {
    submitEl.textContent = "Resize";
    updateSubmitState();
  }
});

updateSubmitState();

