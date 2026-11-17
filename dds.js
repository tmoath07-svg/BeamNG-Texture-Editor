(function (root) {
  "use strict";
  function getInfo(buffer) {
    var view = new DataView(buffer);
    if (buffer.byteLength < 128 || view.getUint32(0, true) !== 0x20534444) throw new Error("ملف DDS غير صالح");
    if (view.getUint32(4, true) !== 124) throw new Error("رأس DDS غير مدعوم");
    var height = view.getUint32(12, true), width = view.getUint32(16, true);
    var mipCount = Math.max(1, view.getUint32(28, true) || 1);
    var pfFlags = view.getUint32(80, true), fourCC = "";
    for (var i = 0; i < 4; i++) fourCC += String.fromCharCode(view.getUint8(84 + i));
    var dataOffset = 128, format = fourCC;
    if (fourCC === "DX10") {
      if (buffer.byteLength < 148) throw new Error("رأس DDS DX10 ناقص");
      var dxgi = view.getUint32(128, true);
      dataOffset = 148;
      if (dxgi === 71 || dxgi === 72) format = "DXT1";
      else if (dxgi === 77 || dxgi === 78) format = "DXT5";
      else if (dxgi === 28 || dxgi === 29) format = "RGBA";
      else if (dxgi === 87 || dxgi === 91) format = "BGRA";
      else format = "DXGI_" + dxgi;
    } else if (fourCC === "DXT1" || fourCC === "DXT3" || fourCC === "DXT5") {
      format = fourCC;
    } else if ((pfFlags & 0x40) && (view.getUint32(88, true) === 32 || view.getUint32(88, true) === 24)) {
      format = "RGB";
    } else {
      throw new Error("صيغة DDS غير مدعومة للمعاينة: " + fourCC);
    }
    if (!width || !height || width > 16384 || height > 16384) throw new Error("أبعاد التكستر غير صالحة");
    return { width: width, height: height, mipCount: Math.min(mipCount, 16), format: format, dataOffset: dataOffset };
  }
  function color565(value) {
    var r = (value >> 11) & 31, g = (value >> 5) & 63, b = value & 31;
    return [Math.round(r * 255 / 31), Math.round(g * 255 / 63), Math.round(b * 255 / 31), 255];
  }
  function mix(a, b, wa, wb, div) {
    return [Math.round((a[0] * wa + b[0] * wb) / div), Math.round((a[1] * wa + b[1] * wb) / div), Math.round((a[2] * wa + b[2] * wb) / div), 255];
  }
  function alphaPalette(a0, a1) {
    var p = [a0, a1];
    if (a0 > a1) {
      for (var i = 1; i <= 6; i++) p.push(Math.round(((7 - i) * a0 + i * a1) / 7));
    } else {
      for (var j = 1; j <= 4; j++) p.push(Math.round(((5 - j) * a0 + j * a1) / 5));
      p.push(0, 255);
    }
    return p;
  }
  function decode(buffer) {
    var info = getInfo(buffer), view = new DataView(buffer);
    var out = new Uint8ClampedArray(info.width * info.height * 4);
    if (info.format === "DXT1" || info.format === "DXT3" || info.format === "DXT5") {
      var blockBytes = info.format === "DXT1" ? 8 : 16;
      var blocksX = Math.ceil(info.width / 4), blocksY = Math.ceil(info.height / 4);
      for (var by = 0; by < blocksY; by++) for (var bx = 0; bx < blocksX; bx++) {
        var off = info.dataOffset + (by * blocksX + bx) * blockBytes;
        if (off + blockBytes > buffer.byteLength) throw new Error("بيانات DDS ناقصة");
        var alpha = null, colorOff = off;
        if (info.format === "DXT3") {
          alpha = new Array(16);
          for (var ai = 0; ai < 16; ai++) {
            var ab = view.getUint8(off + Math.floor(ai / 2));
            alpha[ai] = ((ai & 1) ? ab >> 4 : ab & 15) * 17;
          }
          colorOff += 8;
        } else if (info.format === "DXT5") {
          var a0 = view.getUint8(off), a1 = view.getUint8(off + 1);
          var ap = alphaPalette(a0, a1), bits = 0;
          for (var bi = 0; bi < 6; bi++) bits += view.getUint8(off + 2 + bi) * Math.pow(256, bi);
          alpha = new Array(16);
          for (var ix = 0; ix < 16; ix++) alpha[ix] = ap[Math.floor(bits / Math.pow(2, ix * 3)) % 8];
          colorOff += 8;
        }
        var c0 = view.getUint16(colorOff, true), c1 = view.getUint16(colorOff + 2, true);
        var c0rgb = color565(c0), c1rgb = color565(c1), palette = [c0rgb, c1rgb];
        var forceFour = info.format !== "DXT1";
        if (c0 > c1 || forceFour) {
          palette.push(mix(c0rgb, c1rgb, 2, 1, 3), mix(c0rgb, c1rgb, 1, 2, 3));
        } else {
          palette.push(mix(c0rgb, c1rgb, 1, 1, 2), [0, 0, 0, 0]);
        }
        var indices = view.getUint32(colorOff + 4, true);
        for (var py = 0; py < 4; py++) for (var px = 0; px < 4; px++) {
          var x = bx * 4 + px, y = by * 4 + py;
          if (x >= info.width || y >= info.height) continue;
          var pi = py * 4 + px, ci = (indices >>> (pi * 2)) & 3;
          var color = palette[ci], dst = (y * info.width + x) * 4;
          out[dst] = color[0]; out[dst + 1] = color[1]; out[dst + 2] = color[2];
          out[dst + 3] = alpha ? alpha[pi] : color[3];
        }
      }
    } else {
      var bitsPerPixel = view.getUint32(88, true), bytesPerPixel = bitsPerPixel / 8;
      var rMask = view.getUint32(92, true), gMask = view.getUint32(96, true), bMask = view.getUint32(100, true), aMask = view.getUint32(104, true);
      function component(pixel, mask, fallback) {
        if (!mask) return fallback;
        var shift = 0, m = mask >>> 0;
        while (((m >>> shift) & 1) === 0 && shift < 32) shift++;
        var max = (m >>> shift) >>> 0, val = ((pixel & m) >>> shift) >>> 0;
        return max ? Math.round(val * 255 / max) : fallback;
      }
      for (var y2 = 0; y2 < info.height; y2++) for (var x2 = 0; x2 < info.width; x2++) {
        var pos = info.dataOffset + (y2 * info.width + x2) * bytesPerPixel;
        if (pos + bytesPerPixel > buffer.byteLength) throw new Error("بيانات DDS ناقصة");
        var pixel = bytesPerPixel === 4 ? view.getUint32(pos, true) : (view.getUint8(pos) | (view.getUint8(pos + 1) << 8) | (view.getUint8(pos + 2) << 16));
        var dest = (y2 * info.width + x2) * 4;
        if (info.format === "BGRA") {
          out[dest] = view.getUint8(pos + 2); out[dest + 1] = view.getUint8(pos + 1); out[dest + 2] = view.getUint8(pos); out[dest + 3] = view.getUint8(pos + 3);
        } else {
          out[dest] = component(pixel, rMask, 0); out[dest + 1] = component(pixel, gMask, 0);
          out[dest + 2] = component(pixel, bMask, 0); out[dest + 3] = component(pixel, aMask, 255);
        }
      }
    }
    return { width: info.width, height: info.height, data: out, info: info };
  }
  function downsample(src, width, height) {
    var nw = Math.max(1, Math.floor(width / 2)), nh = Math.max(1, Math.floor(height / 2));
    var dst = new Uint8ClampedArray(nw * nh * 4);
    for (var y = 0; y < nh; y++) for (var x = 0; x < nw; x++) for (var c = 0; c < 4; c++) {
      var sum = 0, n = 0;
      for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
        var sx = Math.min(width - 1, x * 2 + dx), sy = Math.min(height - 1, y * 2 + dy);
        sum += src[(sy * width + sx) * 4 + c]; n++;
      }
      dst[(y * nw + x) * 4 + c] = Math.round(sum / n);
    }
    return { data: dst, width: nw, height: nh };
  }
  function encodeRGBA(width, height, rgba, requestedMipCount) {
    if (!width || !height || rgba.length !== width * height * 4) throw new Error("بيانات الصورة غير صالحة");
    var maxMips = 1, mw = width, mh = height;
    while (mw > 1 || mh > 1) { mw = Math.max(1, Math.floor(mw / 2)); mh = Math.max(1, Math.floor(mh / 2)); maxMips++; }
    var mipCount = Math.max(1, Math.min(maxMips, requestedMipCount || 1));
    var levels = [{ data: new Uint8ClampedArray(rgba), width: width, height: height }];
    while (levels.length < mipCount) {
      var prev = levels[levels.length - 1];
      levels.push(downsample(prev.data, prev.width, prev.height));
    }
    var total = 128;
    levels.forEach(function (level) { total += level.width * level.height * 4; });
    var buffer = new ArrayBuffer(total), view = new DataView(buffer), bytes = new Uint8Array(buffer);
    view.setUint32(0, 0x20534444, true); view.setUint32(4, 124, true);
    view.setUint32(8, 0x100F | (mipCount > 1 ? 0x20000 : 0), true);
    view.setUint32(12, height, true); view.setUint32(16, width, true); view.setUint32(20, width * 4, true);
    view.setUint32(24, 0, true); view.setUint32(28, mipCount, true);
    view.setUint32(76, 32, true); view.setUint32(80, 0x41, true); view.setUint32(84, 0, true);
    view.setUint32(88, 32, true); view.setUint32(92, 0x000000ff, true); view.setUint32(96, 0x0000ff00, true);
    view.setUint32(100, 0x00ff0000, true); view.setUint32(104, 0xff000000, true);
    view.setUint32(108, 0x1000 | (mipCount > 1 ? 0x8 | 0x400000 : 0), true); view.setUint32(112, 0, true);
    var offset = 128;
    levels.forEach(function (level) { bytes.set(level.data, offset); offset += level.data.length; });
    return buffer;
  }
  var api = { getInfo: getInfo, decode: decode, encodeRGBA: encodeRGBA };
  root.BeamNGDDS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);