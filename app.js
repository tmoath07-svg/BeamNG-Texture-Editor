(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const canvas = $("editorCanvas"), ctx = canvas.getContext("2d");
  const state = { zip: null, archiveName: "", items: [], source: null, fileName: "", currentItem: null, fontFamily: "system-ui", fontObjectUrl: null, textWorker: null, cvReady: null, replacementTarget: null, originalDDSInfo: null, overlaySource: null, overlayX: 50, overlayY: 50, overlaySize: 35, draggingOverlay: false, baseCanvas: null, selection: null, selecting: false, selectionStart: null, selectionMode: false };
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
  function drawDecorations(targetCtx, width, height) {
    const text = $("textInput").value;
    if (text) {
      const size = Number($("fontSize").value);
      const tx = width * Number($("textX").value) / 100;
      const ty = height * Number($("textY").value) / 100;
      targetCtx.font = "700 " + size + "px \"" + state.fontFamily + "\"";
      targetCtx.textAlign = "center"; targetCtx.textBaseline = "middle"; targetCtx.lineJoin = "round";
      targetCtx.strokeStyle = "rgba(0,0,0,.78)"; targetCtx.lineWidth = Math.max(2, size * .09);
      targetCtx.strokeText(text, tx, ty, width * .92);
      targetCtx.fillStyle = $("fontColor").value;
      targetCtx.fillText(text, tx, ty, width * .92);
    }
    if (state.overlaySource) {
      const ow = width * state.overlaySize / 100;
      const oh = ow * state.overlaySource.height / state.overlaySource.width;
      const ox = width * state.overlayX / 100, oy = height * state.overlayY / 100;
      targetCtx.drawImage(state.overlaySource.image, ox - ow / 2, oy - oh / 2, ow, oh);
    }
  }
  function draw(showSelection = true) {
    if (!state.source || !state.baseCanvas) return;
    canvas.width = state.source.width; canvas.height = state.source.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(state.baseCanvas, 0, 0);
    drawDecorations(ctx, canvas.width, canvas.height);
    if (showSelection && state.selection) {
      const r = state.selection;
      ctx.save(); ctx.setLineDash([8, 5]); ctx.lineWidth = Math.max(1, canvas.width / 500);
      ctx.strokeStyle = "#ffffff"; ctx.fillStyle = "rgba(167,139,250,.16)";
      ctx.fillRect(r.x, r.y, r.width, r.height); ctx.strokeRect(r.x, r.y, r.width, r.height); ctx.restore();
    }
  }
  function resetBase(source) {
    state.baseCanvas = document.createElement("canvas");
    state.baseCanvas.width = source.width; state.baseCanvas.height = source.height;
    const baseCtx = state.baseCanvas.getContext("2d", { alpha: true });
    if (source.data) baseCtx.putImageData(new ImageData(new Uint8ClampedArray(source.data), source.width, source.height), 0, 0);
    else baseCtx.drawImage(source.image, 0, 0, source.width, source.height);
    state.selection = null; state.selecting = false; state.selectionStart = null;
  }
  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / rect.width)),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / rect.height))
    };
  }
  function selectionRect(a, b) {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
  }
  function applySelection(mode) {
    if (!state.baseCanvas || !state.selection || state.selection.width < 1 || state.selection.height < 1) {
      toast("حدد مساحة بالسحب داخل الصورة أولاً"); return;
    }
    const r = state.selection, baseCtx = state.baseCanvas.getContext("2d");
    if (mode === "fill") { baseCtx.fillStyle = $("backgroundColor").value; baseCtx.fillRect(r.x, r.y, r.width, r.height); }
    else baseCtx.clearRect(r.x, r.y, r.width, r.height);
    state.selection = null; draw(); toast(mode === "fill" ? "تم تغيير لون المساحة المحددة" : "تم حذف محتوى المساحة المحددة");
  }
  function clearEntireImage() {
    if (!state.baseCanvas) return;
    state.baseCanvas.getContext("2d").clearRect(0, 0, state.baseCanvas.width, state.baseCanvas.height);
    state.selection = null; draw(); toast("تم تفريغ الصورة؛ اكتب تصميمك الجديد");
  }

  async function loadScriptOnce(src, test) {
    if (test()) return;
    const existing = [...document.scripts].find(script => script.src === src);
    if (existing) {
      await new Promise((resolve, reject) => { existing.addEventListener("load", resolve, { once: true }); existing.addEventListener("error", reject, { once: true }); });
      if (test()) return;
      throw new Error("تعذر تحميل مكتبة المعالجة");
    }
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src; script.async = true;
      script.onload = resolve; script.onerror = () => reject(new Error("تعذر تحميل مكتبة المعالجة؛ تحقق من الإنترنت"));
      document.head.append(script);
    });
    if (!test()) throw new Error("المكتبة لم تجهز بشكل صحيح");
  }
  async function getTextRecognizer() {
    await loadScriptOnce("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js", () => !!window.Tesseract);
    if (!state.textWorker) state.textWorker = await window.Tesseract.createWorker("eng+ara", 1);
    return state.textWorker;
  }
  async function getOpenCV() {
    if (state.cvReady) return state.cvReady;
    state.cvReady = (async () => {
      const src = "https://docs.opencv.org/4.x/opencv.js";
      if (window.cv && window.cv.Mat) return window.cv;
      const script = document.createElement("script");
      script.src = src; script.async = true;
      const loaded = new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error("تعذر تحميل محرك ترميم الصور؛ تحقق من الإنترنت"));
        document.head.append(script);
      });
      await loaded;
      const cvRef = window.cv;
      if (cvRef && cvRef.Mat) return cvRef;
      await new Promise((resolve, reject) => {
        const previous = cvRef && cvRef.onRuntimeInitialized;
        if (!cvRef) { reject(new Error("محرك ترميم الصور لم يبدأ")); return; }
        cvRef.onRuntimeInitialized = () => { if (typeof previous === "function") previous(); resolve(); };
        setTimeout(() => reject(new Error("استغرق تشغيل محرك ترميم الصور وقتاً طويلاً")), 90000);
      });
      return window.cv;
    })().catch(error => { state.cvReady = null; throw error; });
    return state.cvReady;
  }
  function inpaintAreas(areas) {
    if (!state.baseCanvas || !areas.length) throw new Error("ما تم العثور على منطقة لإزالتها");
    const cvRef = window.cv, width = state.baseCanvas.width, height = state.baseCanvas.height;
    const baseCtx = state.baseCanvas.getContext("2d", { willReadFrequently: true });
    const original = baseCtx.getImageData(0, 0, width, height);
    const src = cvRef.matFromImageData(original), srcRGB = new cvRef.Mat();
    const mask = cvRef.Mat.zeros(height, width, cvRef.CV_8UC1);
    const dst = new cvRef.Mat(), dstRGBA = new cvRef.Mat();
    try {
      cvRef.cvtColor(src, srcRGB, cvRef.COLOR_RGBA2RGB);
      areas.forEach(area => {
        const pad = Math.max(2, Math.round((area.y1 - area.y0) * 0.16));
        const x0 = Math.max(0, Math.floor(area.x0 - pad));
        const y0 = Math.max(0, Math.floor(area.y0 - pad));
        const x1 = Math.min(width - 1, Math.ceil(area.x1 + pad));
        const y1 = Math.min(height - 1, Math.ceil(area.y1 + pad));
        if (x1 > x0 && y1 > y0) cvRef.rectangle(mask, new cvRef.Point(x0, y0), new cvRef.Point(x1, y1), new cvRef.Scalar(255), -1);
      });
      const radius = Math.max(3, Math.min(9, Math.round(Math.min(width, height) / 180)));
      cvRef.inpaint(srcRGB, mask, dst, radius, cvRef.INPAINT_TELEA);
      cvRef.cvtColor(dst, dstRGBA, cvRef.COLOR_RGB2RGBA);
      const repaired = new Uint8ClampedArray(dstRGBA.data);
      for (let i = 3; i < repaired.length; i += 4) repaired[i] = original.data[i];
      baseCtx.putImageData(new ImageData(repaired, width, height), 0, 0);
    } finally {
      src.delete(); srcRGB.delete(); mask.delete(); dst.delete(); dstRGBA.delete();
    }
    state.selection = null;
    draw();
  }
  async function removeTextAutomatically() {
    if (!state.baseCanvas) { toast("افتح صورة أولاً"); return; }
    const button = $("autoRemoveTextButton");
    button.disabled = true; button.textContent = "جاري اكتشاف النص...";
    try {
      toast("جاري قراءة النصوص العربية والإنجليزية...");
      const worker = await getTextRecognizer();
      const result = await worker.recognize(state.baseCanvas);
      const lines = (result.data.lines || []).filter(line => (line.text || "").trim() && line.confidence >= 35 && line.bbox);
      const areas = lines.map(line => ({ x0: line.bbox.x0, y0: line.bbox.y0, x1: line.bbox.x1, y1: line.bbox.y1 }));
      if (!areas.length) { toast("ما اكتشفت نص واضح بالصورة؛ جرّب التحديد اليدوي"); return; }
      button.textContent = "جاري ترميم الصورة...";
      toast("تم اكتشاف " + areas.length + " منطقة نص؛ جاري ترميمها...");
      await getOpenCV();
      inpaintAreas(areas);
      toast("تمت إزالة النصوص المكتشفة. راجع النتيجة قبل الحفظ");
    } catch (error) {
      toast(error.message || "تعذرت إزالة النص تلقائياً");
    } finally {
      button.disabled = false; button.textContent = "إزالة النص تلقائياً";
    }
  }
  async function removeTextFromSelection() {
    if (!state.selection) { toast("حدد النص بالسحب أولاً"); return; }
    const r = state.selection;
    const button = $("removeSelectedTextButton");
    button.disabled = true;
    try {
      toast("جاري ترميم المنطقة المحددة...");
      await getOpenCV();
      inpaintAreas([{ x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height }]);
      toast("تم ترميم المنطقة المحددة؛ راجع النتيجة قبل الحفظ");
    } catch (error) {
      toast(error.message || "تعذر ترميم المنطقة");
    } finally { button.disabled = false; }
  }
  function showSource(source, item) {
    state.source = source; resetBase(source); state.currentItem = item || null;
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
    if (file.size > 256 * 1024 * 1024) { toast("حجم ZIP أكبر من الحد المسموح (256 MB) حفاظاً على ذاكرة الجوال"); return; }
    try {
      toast("جاري قراءة ملف السيارة...");
      const zip = await JSZip.loadAsync(file, { checkCRC32: false, createFolders: false });
      const allEntries = Object.values(zip.files).filter(entry => !entry.dir);
      if (allEntries.length > 25000) throw new Error("الأرشيف يحتوي على ملفات كثيرة جداً");
      const uncompressedTotal = allEntries.reduce((sum, entry) => sum + (entry._data && Number(entry._data.uncompressedSize) || 0), 0);
      if (uncompressedTotal > 768 * 1024 * 1024) throw new Error("الحجم بعد فك الضغط يتجاوز 768 MB؛ اختصر ملفات السيارة أولاً");
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
      renderList(); toast(state.currentItem.ext === "dds" ? "تم حفظ DDS غير مضغوط RGBA؛ اختبره داخل اللعبة" : "تم حفظ التعديل داخل ملف السيارة");
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
      drawDecorations(workCtx, dims.width, dims.height);
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
      toast("تم استبدال التكستر وتحويل الصورة تلقائياً إلى " + prettyType(item.ext) + (item.ext === "dds" ? " غير مضغوط RGBA" : ""));
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
  $("selectionModeButton").addEventListener("click", () => {
    state.selectionMode = !state.selectionMode;
    $("selectionModeButton").classList.toggle("active", state.selectionMode);
    $("selectionModeButton").textContent = state.selectionMode ? "إيقاف التحديد" : "تحديد بالسحب";
    canvas.style.cursor = state.selectionMode ? "crosshair" : "default";
    toast(state.selectionMode ? "اسحب على الصورة لتحديد المنطقة" : "تم إيقاف وضع التحديد");
  });
  $("fillSelectionButton").addEventListener("click", () => applySelection("fill"));
  $("eraseSelectionButton").addEventListener("click", () => applySelection("erase"));
  $("clearImageButton").addEventListener("click", clearEntireImage);
  $("autoRemoveTextButton").addEventListener("click", removeTextAutomatically);
  $("removeSelectedTextButton").addEventListener("click", removeTextFromSelection);
  $("textInput").addEventListener("input", draw);
  $("textX").addEventListener("input", () => { $("textXValue").value = $("textX").value + "%"; draw(); });
  $("textY").addEventListener("input", () => { $("textYValue").value = $("textY").value + "%"; draw(); });
  $("overlaySize").addEventListener("input", () => { state.overlaySize = Number($("overlaySize").value); $("overlaySizeValue").value = state.overlaySize + "%"; draw(); });
  $("overlayInput").addEventListener("change", async () => {
    const file = $("overlayInput").files && $("overlayInput").files[0]; if (!file) return;
    try {
      if (!["png", "jpg", "jpeg", "webp"].includes(extOf(file.name))) throw new Error("اختر PNG أو JPG أو WEBP");
      state.overlaySource = await imageFromBlob(file); state.overlayX = 50; state.overlayY = 50;
      state.overlaySize = 35; $("overlaySize").value = "35"; $("overlaySizeValue").value = "35%";
      $("overlayStatus").textContent = file.name; $("removeOverlayButton").disabled = false;
      draw(); toast("أضفنا الملصق؛ اسحبه داخل المعاينة");
    } catch (error) { toast(error.message || "تعذر تحميل الملصق"); }
    $("overlayInput").value = "";
  });
  $("removeOverlayButton").addEventListener("click", () => {
    state.overlaySource = null; state.draggingOverlay = false;
    $("overlayStatus").textContent = "ما تم إضافة ملصق صورة";
    $("removeOverlayButton").disabled = true; draw(); toast("تم حذف الملصق من المعاينة");
  });
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", event => {
    if (!state.source) return;
    const point = canvasPoint(event);
    if (state.selectionMode) {
      state.selecting = true; state.selectionStart = point;
      state.selection = { x: point.x, y: point.y, width: 0, height: 0 };
      canvas.setPointerCapture(event.pointerId); draw(); event.preventDefault(); return;
    }
    if (!state.overlaySource) return;
    const ow = canvas.width * state.overlaySize / 100;
    const oh = ow * state.overlaySource.height / state.overlaySource.width;
    const cx = canvas.width * state.overlayX / 100, cy = canvas.height * state.overlayY / 100;
    if (point.x >= cx - ow / 2 && point.x <= cx + ow / 2 && point.y >= cy - oh / 2 && point.y <= cy + oh / 2) {
      state.draggingOverlay = true; canvas.setPointerCapture(event.pointerId); event.preventDefault();
    }
  });
  canvas.addEventListener("pointermove", event => {
    if (state.selecting && state.selectionStart) {
      state.selection = selectionRect(state.selectionStart, canvasPoint(event)); draw(); event.preventDefault(); return;
    }
    if (!state.draggingOverlay) return;
    const point = canvasPoint(event);
    state.overlayX = point.x / canvas.width * 100; state.overlayY = point.y / canvas.height * 100;
    draw(); event.preventDefault();
  });
  const stopCanvasDrag = () => {
    if (state.selecting) {
      state.selecting = false; state.selectionStart = null;
      if (!state.selection || state.selection.width < 2 || state.selection.height < 2) state.selection = null;
      draw();
    }
    state.draggingOverlay = false;
  };
  canvas.addEventListener("pointerup", stopCanvasDrag);
  canvas.addEventListener("pointercancel", stopCanvasDrag);
  $("fontSize").addEventListener("input", () => { $("fontSizeValue").value = $("fontSize").value; draw(); });
  $("fontColor").addEventListener("input", () => { $("colorValue").textContent = $("fontColor").value.toUpperCase(); draw(); });
  $("resetButton").addEventListener("click", () => { $("textInput").value = ""; draw(); toast("تمت إزالة الكتابة من المعاينة"); });
  $("saveTextureButton").addEventListener("click", saveCurrentToZip);
  $("exportZipButton").addEventListener("click", exportZip);
  $("exportButton").addEventListener("click", async () => {
    if (!state.source) return;
    try {
      draw(false); const blob = await canvasBlob("image/png");
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