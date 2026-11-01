/* Browser-only image preparation. No third-party services or dependencies. */
(function () {
  'use strict';
  async function staticImage(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return true;
    if (bytes.length < 8 || bytes.slice(0, 8).join(',') !== '137,80,78,71,13,10,26,10') return false;
    const view = new DataView(bytes.buffer);
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      if (offset + length + 12 > bytes.length) return false;
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      if (type === 'acTL') return false; // APNG must retain every animation frame.
      if (type === 'IEND') return true;
      offset += length + 12;
    }
    return false;
  }
  function decode(file) {
    return new Promise((resolve, reject) => {
      const image = new Image(), url = URL.createObjectURL(file);
      const timer = setTimeout(() => finish(new Error('decode timeout')), 8000);
      function finish(error) {
        clearTimeout(timer); image.onload = image.onerror = null; URL.revokeObjectURL(url);
        if (error) reject(error); else resolve(image);
      }
      image.onload = () => finish(); image.onerror = () => finish(new Error('decode failed')); image.src = url;
    });
  }
  function canvasFor(image, limit) {
    const scale = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  async function prepare(file, compress) {
    const result = { file, thumbnail: '' };
    try {
      if (!await staticImage(file)) return result;
      const image = await decode(file);
      if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 32000000) return result;
      const thumbnail = canvasFor(image, 80).toDataURL('image/webp', 0.65);
      if (thumbnail.length <= 16000) result.thumbnail = thumbnail;
      if (!compress || file.size < 256 * 1024) return result;
      const canvas = canvasFor(image, 2560);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
      if (blob && blob.type === 'image/webp' && blob.size < file.size * 0.9) {
        result.file = new File([blob], (file.name || 'image').replace(/\.[^.]+$/, '') + '.webp', { type: blob.type });
      }
      canvas.width = canvas.height = 1;
    } catch (_) { /* Unsupported or damaged images use the original upload path. */ }
    return result;
  }
  function historyThumbnail(item) {
    // Old history deliberately gets a placeholder: never fetch a full original just for an icon.
    if (typeof item.thumbnail === 'string' && item.thumbnail.length <= 16000
        && /^data:image\/(?:webp|png|jpeg);base64,[a-z0-9+/=]+$/i.test(item.thumbnail)) {
      const image = document.createElement('img');
      image.width = image.height = 48; image.decoding = 'async'; image.loading = 'lazy';
      image.src = item.thumbnail; image.alt = ''; return image;
    }
    const icon = document.createElement('div'); icon.className = 'history-thumb';
    icon.textContent = item.kind === 'video' ? '▶' : item.kind === 'file' ? '⇩' : '▧';
    icon.title = '点击文件链接查看原图或文件'; return icon;
  }
  window.TblSpeed = { prepare, historyThumbnail };
})();
