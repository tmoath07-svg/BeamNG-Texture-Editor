(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const imageInput = $("imageInput"), canvas = $("editorCanvas"), ctx = canvas.getContext("2d");
  const searchInput = $("searchInput"), textureList = $("textureList");
  const state = { image: null, fileName: "", fontFamily: "system-ui", fontLoaded: false, items: [], baseCanvas: null };
  let toastTimer;
  function toast(message) {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }
  function draw() {
    if (!state.image) return;
    canvas.width = state.image.naturalWidth; canvas.height = state.image.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(state.image, 0, 0);
    const text = $("textInput").value;
    if (text) {
      const size = Number($("fontSize").value);
      ctx.font = `700 ${size}px "${state.fontFamily}"`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(0,0,0,.72)";
      ctx.lineWidth = Math.max(2, size * .09);
      ctx.strokeText(text, canvas.width / 2, canvas.height / 2, canvas.width * .9);
      ctx.fillStyle = $("fontColor").value;
      ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * .9);
    }
  }
  function renderList() {
    const q = searchInput.value.trim().toLocaleLowerCase();
    const visible = state.items.filter(item => item.name.toLocaleLowerCase().includes(q));
    $("textureCount").textContent = state.items.length;
    $("filteredCount").textContent = visible.length;
    textureList.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement("div"); empty.className = "list-empty";
      empty.textContent = q ? "ما فيه نتائج تطابق البحث" : "ما فيه ملفات حالياً"; textureList.append(empty); return;
    }
    visible.forEach(item => {
      const row = document.createElement("div"); row.className = "texture-item";
      const img = document.createElement("img"); img.src = item.url; img.alt = "";
      const meta = document.createElement("div"); meta.className = "texture-meta";
      const name = document.createElement("strong"); name.textContent = item.name;
      const info = document.createElement("small"); info.textContent = item.type + " • " + item.size;
      meta.append(name, info);
      const open = document.createElement("button"); open.type = "button"; open.textContent = "فتح";
      open.addEventListener("click", () => loadItem(item));
      row.append(img, meta, open); textureList.append(row);
    });
  }
  function loadItem(item) {
    const image = new Image();
    image.onload = () => {
      state.image = image; state.fileName = item.name; draw();
      canvas.hidden = false; $("emptyState").hidden = true;
      $("imageStatus").textContent = item.name + " • " + image.naturalWidth + " × " + image.naturalHeight;
      $("formatLabel").textContent = item.type;
      $("exportButton").disabled = false; $("resetButton").disabled = false;
      $("applyTextButton").disabled = false; toast("تم فتح الصورة");
    };
    image.onerror = () => toast("تعذر قراءة الصورة");
    image.src = item.url;
  }
  imageInput.addEventListener("change", () => {
    const files = Array.from(imageInput.files || []);
    files.forEach(file => {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast("الصيغة غير مدعومة حالياً"); return; }
      const url = URL.createObjectURL(file);
      const item = { name: file.name, type: file.type.split("/")[1].toUpperCase(), size: (file.size / 1024).toFixed(1) + " KB", url };
      state.items.unshift(item); loadItem(item);
    });
    renderList(); imageInput.value = "";
  });
  searchInput.addEventListener("input", renderList);
  $("textInput").addEventListener("input", draw);
  $("fontSize").addEventListener("input", () => { $("fontSizeValue").value = $("fontSize").value; draw(); });
  $("fontColor").addEventListener("input", () => { $("colorValue").textContent = $("fontColor").value.toUpperCase(); draw(); });
  $("applyTextButton").addEventListener("click", () => { draw(); toast("تم تحديث معاينة الكتابة"); });
  $("fontInput").addEventListener("change", async () => {
    const file = $("fontInput").files && $("fontInput").files[0]; if (!file) return;
    if (!file.name.toLowerCase().endsWith(".ttf")) { toast("اختر ملف خط بصيغة TTF"); return; }
    try {
      const family = "UserFont" + Date.now();
      const font = new FontFace(family, `url(${URL.createObjectURL(file)})`);
      await font.load(); document.fonts.add(font); state.fontFamily = family; state.fontLoaded = true;
      $("fontStatus").textContent = "تم تحميل: " + file.name; draw(); toast("تم تحميل الخط");
    } catch { toast("تعذر تحميل هذا الخط"); }
    $("fontInput").value = "";
  });
  $("exportButton").addEventListener("click", () => {
    if (!state.image) return;
    draw();
    canvas.toBlob(blob => {
      if (!blob) { toast("تعذر تصدير الصورة"); return; }
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      const base = state.fileName.replace(/\.[^.]+$/, "") || "texture";
      a.href = url; a.download = base + "-edited.png"; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500); toast("تم تجهيز الصورة بصيغة PNG");
    }, "image/png");
  });
  $("resetButton").addEventListener("click", () => { $("textInput").value = ""; draw(); toast("تمت إزالة الكتابة من المعاينة"); });
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();