// Serve immutable originals without buffering them into memory.
const fs = require('node:fs');
module.exports = function deliver(req, res, filePath, record, stats, downloadDisposition) {
  const inline = record.kind === 'image' || record.kind === 'video'
    || (!record.kind && /^(?:image|video)\//.test(String(record.mime || '')));
  const etag = '"' + stats.size.toString(16) + '-' + Math.trunc(stats.mtimeMs).toString(16) + '"';
  const modified = stats.mtime.toUTCString();
  const headers = {
    'Content-Type': inline ? record.mime : 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': inline ? 'inline' : downloadDisposition(record.originalName),
    'Accept-Ranges': 'bytes', ETag: etag, 'Last-Modified': modified
  };
  const matches = value => String(value).split(',').some(t => t.trim() === '*' || t.trim().replace(/^W\//, '') === etag);
  const since = Date.parse(req.headers['if-modified-since']);
  if (req.headers['if-none-match'] ? matches(req.headers['if-none-match'])
      : Number.isFinite(since) && Math.trunc(stats.mtimeMs / 1000) * 1000 <= since) {
    res.writeHead(304, headers); res.end(); return;
  }
  // Range applies to GET only. HEAD always describes the complete representation.
  const ifRange = req.headers['if-range'];
  const rangeFresh = !ifRange || ifRange === etag
    || (Number.isFinite(Date.parse(ifRange)) && Date.parse(ifRange) >= Math.trunc(stats.mtimeMs / 1000) * 1000);
  const range = req.method === 'GET' && rangeFresh && String(req.headers.range || '').match(/^bytes=(\d*)-(\d*)$/);
  let start = 0, end = stats.size - 1, status = 200;
  if (range && (range[1] || range[2])) {
    if (!range[1]) start = Math.max(0, stats.size - Number(range[2]));
    else { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), end); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= stats.size || end < start || (!range[1] && Number(range[2]) === 0)) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stats.size}`, 'Content-Length': 0 });
      res.end(); return;
    }
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
  }
  headers['Content-Length'] = Math.max(0, end - start + 1);
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || !stats.size) { res.end(); return; }
  const stream = fs.createReadStream(filePath, { start, end });
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy()); stream.pipe(res);
};
