(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const canvas = $("editorCanvas"), ctx = canvas.getContext("2d");
  const state = { zip: null, archiveName: "", items: [], source: null, fileName: "", currentItem: null, fontFamily: "system-ui", fontObjectUrl: null, replacementTarget: null, originalDDSInfo: null };
  let toastTimer = 0;
  const textureExts = ["png", "jpg", "jpeg", "webp", "dds"];
  function toast(message) {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
  }
  function extOf(name) { return (name.split(".").pop() || "").toLowerCase(); }
  function prettyType(ext) { return ext === "jpeg" ? "JPG" : ext.toUpperCase(); }
  function updateCounts() {
    $("textureCount").textContent = state.items.length;
    $("filteredCount").textContent = $("textureList").children.length;
    $("archiveDetails").textContent = state.items.length + " تكستر قابل للتعامل";
  }
  function draw() {
    if (!state.source) return;
    canvas.width = state.source.width; canvas.height = state.source.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (state.source.data) ctx.putImageData(new ImageData(new Uint8ClampedArray(state.source.data), state.source.width, state.source.height), 0, 0);
    else ctx.drawImage(state.source.image, 0, 0, canvas.width, canvas.height);
    const text = $("textInput").value;
    if (text) {
      const size = Number($("fontSize").value);
      ctx.font = "700 " + size + "px \"" + state.fontFamily + "\"";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,.78)"; ctx.lineWidth = Math.max(2, size * .09);
      ctx.strokeText(text, canvas.width / 2, canvas.height / 2, canvas.width * .92);
      ctx.fillStyle = $("fontColor").value;
      ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * .92);
    }
  }
  function showSource(source, item) {
    state.source = source; state.currentItem = item || null;
    state.fileName = item ? item.name : "texture";
    state.originalDDSInfo = item && item.ddsInfo ? item.ddsInfo : null;
    draw(); canvas.hidden = false; $("emptyState").hidden = true;
    $("imageStatus").textContent = (item ? item.path || item.name : "صورة مستقلة") + " • " + source.width + " × " + source.height;
    $("formatLabel").textContent = item ? prettyType(item.ext) : "صورة مستقلة";
    $("exportButton").disabled = false; $("resetButton").disabled = false;
    $("saveTextureButton").disabled = !(state.zip && item && item.path);
  }
  function renderList() {
    const query = $("searchInput").value.trim().toLocaleLowerCase();
    const filter = $("typeFilter").value;
    const visible = state.items.filter(item => {
      const matchesText = !query || item.path.toLocaleLowerCase().includes(query);
      const matchesType = filter === "all" || item.ext === filter || (filter === "jpg" && item.ext === "jpeg");
      return matchesText && matchesType;
    });
    const list = $("textureList"); list.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement("div"); empty.className = "list-empty";
      empty.textContent = state.items.length ? "ما فيه نتائج تطابق البحث والتصفية" : "افتح ملف سيارة ZIP لعرض التكسترات";
      list.append(empty);
    } else {
      visible.forEach(item => {
        const row = document.createElement("div"); row.className = "texture-item";
        const icon = document.createElement("div"); icon.className = "file-type-icon"; icon.textContent = item.ext.toUpperCase();
        const meta = document.createElement("div"); meta.className = "texture-meta";
        const name = document.createElement("strong"); name.textContent = item.name;
        const info = document.createElement("small"); info.textContent = item.path + " • " + prettyType(item.ext) + (item.modified ? " • معدل" : "");
        meta.append(name, info);
        const actions = document.createElement("div"); actions.className = "item-actions";
        const open = document.createElement("button"); open.type = "button"; open.textContent = "فتح";
        open.addEventListener("click", () => openItem(item));
        const replace = document.createElement("button"); replace.type = "button"; replace.textContent = "استبدال";
        replace.disabled = !state.zip;
        replace.addEventListener("click", () => { state.replacementTarget = item; $("replacementInput").click(); });
        actions.append(open, replace); row.append(icon, meta, actions); list.append(row);
      });
    }
    $("filteredCount").textContent = visible.length;
    $("textureCount").textContent = state.items.length;
  }
  function imageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob), image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve({ kind: "image", image: image, width: image.naturalWidth, height: image.naturalHeight }); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("تعذر فتح الصورة")); };
      image.src = url;
    });
  }
  async function openItem(item) {
    if (item.file) {
      try { const source = await imageFromBlob(item.file); showSource(source, item); toast("تم فتح الصورة"); }
      catch (error) { toast(error.message || "تعذر فتح الصورة"); }
      return;
    }
    await loadArchiveItem(item);
  }
  async function loadArchiveItem(item) {
    try {
      const blob = await item.entry.async("blob");
      if (item.ext === "dds") {
        const buffer = await blob.arrayBuffer(), decoded = BeamNGDDS.decode(buffer);
        item.ddsInfo = decoded.info;
        showSource({ kind: "pixels", data: decoded.data, width: decoded.width, height: decoded.height }, item);
      } else {
        const source = await imageFromBlob(blob);
        item.width = source.width; item.height = source.height;
        showSource(source, item);
      }
      toast("تم فتح التكستر");
    } catch (error) {
      toast(error.message || "تعذر فتح التكستر");
    }
  }
  async function importZip(file) {
    if (!window.JSZip) { toast("مكتبة ZIP ما تحمّلت. افتح التطبيق مع اتصال بالإنترنت ثم أعد المحاولة."); return; }
    if (file.size > 512 * 1024 * 1024) { toast("حجم ZIP أكبر من الحد المسموح (512 MB)"); return; }
    try {
      toast("جاري قراءة ملف السيارة...");
      const zip = await JSZip.loadAsync(file, { checkCRC32: false, createFolders: false });
      const allEntries = Object.values(zip.files).filter(entry => !entry.dir);
      if (allEntries.length > 25000) throw new Error("الأرشيف يحتوي على ملفات كثيرة جداً");
      const uncompressedTotal = allEntries.reduce((sum, entry) => sum + (entry._data && Number(entry._data.uncompressedSize) || 0), 0);
      if (uncompressedTotal > 1024 * 1024 * 1024) throw new Error("الحجم بعد فك الضغط يتجاوز 1 GB؛ اختصر ملفات السيارة أولاً");
      const items = allEntries.filter(entry => textureExts.includes(extOf(entry.name))).map(entry => ({
        path: entry.name, name: entry.name.split("/").pop(), ext: extOf(entry.name), entry: entry,
        size: entry._data && entry._data.uncompressedSize ? entry._data.uncompressedSize : 0, modified: false
      }));
      state.zip = zip; state.archiveName = file.name; state.items = items;
      $("archiveStrip").hidden = false; $("archiveName").textContent = file.name;
      $("exportZipButton").disabled = false;
      $("imageStatus").textContent = "تم العثور على " + items.length + " تكستر";
      $("listDescription").textContent = "ابحث بالاسم أو بمسار الملف، ثم افتح أو استبدل";
      $("searchInput").value = ""; $("typeFilter").value = "all";
      renderList();
      if (items.length) await loadArchiveItem(items[0]);
      else toast("تم فتح ZIP لكن ما لقينا صوراً مدعومة");
      toast("تم فتح ملف السيارة");
    } catch (error) {
      state.zip = null; state.items = [];
      renderList(); toast(error.message || "تعذر قراءة ملف ZIP");
    }
  }
  function canvasBlob(type, quality) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("تعذر تجهيز الصورة")), type, quality));
  }
  async function canvasBytesForItem(item) {
    if (item.ext === "dds") {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const mipCount = item.ddsInfo ? item.ddsInfo.mipCount : 1;
      return new Blob([BeamNGDDS.encodeRGBA(canvas.width, canvas.height, pixels.data, mipCount)], { type: "image/vnd-ms.dds" });
    }
    const mime = item.ext === "jpg" || item.ext === "jpeg" ? "image/jpeg" : item.ext === "webp" ? "image/webp" : "image/png";
    return canvasBlob(mime, mime === "image/jpeg" ? 0.93 : undefined);
  }
  async function saveCurrentToZip() {
    if (!state.zip || !state.currentItem || !state.currentItem.path) { toast("افتح تكستراً من ملف ZIP أولاً"); return; }
    try {
      draw();
      const blob = await canvasBytesForItem(state.currentItem);
      state.zip.file(state.currentItem.path, blob, { date: state.currentItem.entry.date });
      state.currentItem.entry = state.zip.file(state.currentItem.path);
      state.currentItem.modified = true;
      renderList(); toast("تم حفظ التعديل داخل ملف السيارة");
    } catch (error) { toast(error.message || "تعذر حفظ التكستر"); }
  }
  async function getItemDimensions(item) {
    if (item.width && item.height) return { width: item.width, height: item.height };
    const blob = await item.entry.async("blob");
    if (item.ext === "dds") {
      const info = BeamNGDDS.getInfo(await blob.arrayBuffer()); item.ddsInfo = info;
      item.width = info.width; item.height = info.height;
    } else {
      const source = await imageFromBlob(blob); item.width = source.width; item.height = source.height;
    }
    return { width: item.width, height: item.height };
  }
  async function replaceTexture(file, item) {
    try {
      if (!state.zip) throw new Error("افتح ملف سيارة ZIP أولاً");
      const dims = await getItemDimensions(item);
      const source = await imageFromBlob(file);
      const work = document.createElement("canvas"); work.width = dims.width; work.height = dims.height;
      const workCtx = work.getContext("2d", { alpha: true });
      workCtx.drawImage(source.image, 0, 0, dims.width, dims.height);
      const text = $("textInput").value;
      if (text) {
        const size = Number($("fontSize").value);
        workCtx.font = "700 " + size + "px \"" + state.fontFamily + "\"";
        workCtx.textAlign = "center"; workCtx.textBaseline = "middle"; workCtx.lineJoin = "round";
        workCtx.strokeStyle = "rgba(0,0,0,.78)"; workCtx.lineWidth = Math.max(2, size * .09);
        workCtx.strokeText(text, dims.width / 2, dims.height / 2, dims.width * .92);
        workCtx.fillStyle = $("fontColor").value; workCtx.fillText(text, dims.width / 2, dims.height / 2, dims.width * .92);
      }
      let output;
      if (item.ext === "dds") {
        const imageData = workCtx.getImageData(0, 0, dims.width, dims.height);
        output = new Blob([BeamNGDDS.encodeRGBA(dims.width, dims.height, imageData.data, item.ddsInfo ? item.ddsInfo.mipCount : 1)], { type: "image/vnd-ms.dds" });
      } else {
        const mime = item.ext === "jpg" || item.ext === "jpeg" ? "image/jpeg" : item.ext === "webp" ? "image/webp" : "image/png";
        output = await new Promise((resolve, reject) => work.toBlob(blob => blob ? resolve(blob) : reject(new Error("فشل تحويل الصورة")), mime, mime === "image/jpeg" ? 0.93 : undefined));
      }
      state.zip.file(item.path, output, { date: item.entry.date });
      item.entry = state.zip.file(item.path); item.modified = true;
      renderList();
      if (state.currentItem === item) await loadArchiveItem(item);
      toast("تم استبدال التكستر وتحويل الصورة تلقائياً إلى " + prettyType(item.ext));
    } catch (error) { toast(error.message || "تعذر استبدال التكستر"); }
  }
  async function exportZip() {
    if (!state.zip) return;
    try {
      $("exportZipButton").disabled = true; $("exportZipButton").textContent = "جاري التجهيز...";
      const blob = await state.zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 4 }, mimeType: "application/zip" });
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = state.archiveName.replace(/\.zip$/i, "") + "-edited.zip";
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
      toast("تم تجهيز ملف السيارة المعدّل");
    } catch (error) { toast(error.message || "تعذر تصدير ZIP"); }
    finally { $("exportZipButton").disabled = false; $("exportZipButton").textContent = "↓ تصدير ZIP"; }
  }
  $("zipInput").addEventListener("change", async () => {
    const file = $("zipInput").files && $("zipInput").files[0];
    if (file) await importZip(file);
    $("zipInput").value = "";
  });
  $("imageInput").addEventListener("change", async () => {
    const file = $("imageInput").files && $("imageInput").files[0]; if (!file) return;
    try {
      if (!["png", "jpg", "jpeg", "webp"].includes(extOf(file.name))) throw new Error("اختر صورة PNG أو JPG أو WEBP");
      const source = await imageFromBlob(file);
      const item = { name: file.name, path: file.name, ext: extOf(file.name), width: source.width, height: source.height, file: file };
      state.zip = null; state.currentItem = null; state.items = [item];
      $("archiveStrip").hidden = true; $("exportZipButton").disabled = true;
      showSource(source, item); renderList(); toast("تم استيراد الصورة");
    } catch (error) { toast(error.message); }
    $("imageInput").value = "";
  });
  $("replacementInput").addEventListener("change", async () => {
    const file = $("replacementInput").files && $("replacementInput").files[0];
    if (file && state.replacementTarget) await replaceTexture(file, state.replacementTarget);
    $("replacementInput").value = ""; state.replacementTarget = null;
  });
  $("searchInput").addEventListener("input", renderList);
  $("typeFilter").addEventListener("change", renderList);
  $("textInput").addEventListener("input", draw);
  $("fontSize").addEventListener("input", () => { $("fontSizeValue").value = $("fontSize").value; draw(); });
  $("fontColor").addEventListener("input", () => { $("colorValue").textContent = $("fontColor").value.toUpperCase(); draw(); });
  $("resetButton").addEventListener("click", () => { $("textInput").value = ""; draw(); toast("تمت إزالة الكتابة من المعاينة"); });
  $("saveTextureButton").addEventListener("click", saveCurrentToZip);
  $("exportZipButton").addEventListener("click", exportZip);
  $("exportButton").addEventListener("click", async () => {
    if (!state.source) return;
    try {
      draw(); const blob = await canvasBlob("image/png");
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = (state.fileName || "texture").replace(/\.[^.]+$/, "") + "-edited.png";
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("تم تصدير الصورة بصيغة PNG");
    } catch (error) { toast(error.message); }
  });
  $("fontInput").addEventListener("change", async () => {
    const file = $("fontInput").files && $("fontInput").files[0]; if (!file) return;
    if (!file.name.toLowerCase().endsWith(".ttf")) { toast("اختر ملف خط بصيغة TTF"); return; }
    try {
      const url = URL.createObjectURL(file), family = "UserFont" + Date.now();
      const font = new FontFace(family, "url(" + url + ")");
      await font.load(); document.fonts.add(font);
      if (state.fontObjectUrl) URL.revokeObjectURL(state.fontObjectUrl);
      state.fontObjectUrl = url; state.fontFamily = family;
      $("fontStatus").textContent = "تم تحميل: " + file.name; draw(); toast("تم تحميل الخط");
    } catch (error) { toast("تعذر تحميل هذا الخط"); }
    $("fontInput").value = "";
  });
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();