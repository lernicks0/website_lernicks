(function (root) {
  'use strict';

  function detectFormat(content) {
    // HTML fragments are part of Markdown, even when they appear first.
    return 'mixed';
  }

  function resolveFormat(format, content) {
    return ['html', 'mixed', 'markdown', 'latex'].includes(format) ? format : detectFormat(content);
  }

  function insertMarkdownHtml(target, rendered) {
    if (!root.DOMPurify || !root.DOMPurify.isSupported) return false;
    const clean = root.DOMPurify.sanitize(rendered, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'form', 'input', 'textarea', 'select', 'button', 'link', 'meta', 'base'],
      SANITIZE_NAMED_PROPS: true,
      RETURN_DOM_FRAGMENT: true
    });
    for (const link of clean.querySelectorAll('a[href]')) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
    target.replaceChildren(clean);
    return true;
  }

  function renderHtml(target, content) {
    const frame = document.createElement('iframe');
    frame.className = 'html-frame';
    frame.title = 'HTML 文档预览';
    // Never add allow-same-origin: uploaded scripts must not read the editor or its key.
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    const policy = "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline' https://cdn.jsdelivr.net; img-src https: data:; font-src https://cdn.jsdelivr.net data:; media-src https: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    // Put restrictions before any user content, including scripts in its <head>.
    frame.srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + policy + '"><meta name="viewport" content="width=device-width,initial-scale=1">' + String(content);
    target.classList.add('html-preview');
    target.replaceChildren(frame);
  }

  const api = { detectFormat, resolveFormat, renderHtml, insertMarkdownHtml };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MkHtml = api;
})(typeof window === 'object' ? window : globalThis);
