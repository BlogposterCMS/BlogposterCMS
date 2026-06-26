const fs = require('fs');
const path = require('path');

function createUploadMiddleware(options = {}) {
  const {
    fieldName = 'file',
    destResolver,
    maxFileSize = 20 * 1024 * 1024, // 20 MB
    allowedMimeTypes = []
  } = options;

  if (typeof destResolver !== 'function') {
    throw new Error('destResolver option must be a function');
  }

  return function streamUpload(req, res, next) {
    const ctype = req.headers['content-type'] || '';
    const match = ctype.match(/boundary=(?:(?:"([^\"]+)")|([^;]+))/i);
    if (!match) {
      return res.status(400).json({ error: 'Expected multipart/form-data' });
    }

    const boundary = '--' + (match[1] || match[2]);
    const endBoundary = boundary + '--';
    const boundaryBuffer = Buffer.from('\r\n' + boundary);
    const endBoundaryBuffer = Buffer.from('\r\n' + endBoundary);

    let buffer = Buffer.alloc(0);
    let remainder = Buffer.alloc(0);
    let headerParsed = false;
    let fileStream = null;
    let fileInfo = null;

    function finish(err) {
      if (fileStream && !fileStream.closed) fileStream.end();
      if (err) return res.status(400).json({ error: err.message || err });
      req.uploadFile = fileInfo;
      next();
    }

    req.on('data', chunk => {
      if (!headerParsed) {
        buffer = Buffer.concat([buffer, chunk]);
        const firstBoundary = Buffer.from(boundary + '\r\n');
        const fbIndex = buffer.indexOf(firstBoundary);
        if (fbIndex !== -1) {
          buffer = buffer.slice(fbIndex + firstBoundary.length);
        }
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const headerStr = buffer.slice(0, headerEnd).toString();
        buffer = buffer.slice(headerEnd + 4);
        const nameRe = new RegExp(`name=\"${fieldName}\"; filename=\"([^\"]*)\"`, 'i');
        const nameMatch = headerStr.match(nameRe);
        if (!nameMatch) return finish('File field missing');
        const original = path.basename(nameMatch[1]);
        const typeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
        const mimeType = typeMatch ? typeMatch[1].trim() : 'application/octet-stream';
        if (allowedMimeTypes.length && !allowedMimeTypes.includes(mimeType)) {
          return finish('Invalid file type');
        }
        const destDir = destResolver(req, original);
        try { fs.mkdirSync(destDir, { recursive: true }); } catch {}
        let finalName = original;
        let destPath = path.join(destDir, finalName);
        if (fs.existsSync(destPath)) {
          const ext = path.extname(finalName);
          const base = path.basename(finalName, ext);
          finalName = base + '-' + Date.now() + ext;
          destPath = path.join(destDir, finalName);
        }
        fileInfo = { originalName: original, finalName, mimeType, path: destPath, size: 0 };
        fileStream = fs.createWriteStream(destPath);
        headerParsed = true;
        if (buffer.length) handleContent(buffer);
        buffer = Buffer.alloc(0);
      } else {
        handleContent(chunk);
      }
    });

    req.on('end', () => {
      if (!fileStream) return finish('No file found');
      finish();
    });

    function handleContent(chunk) {
      let data = Buffer.concat([remainder, chunk]);
      let idx;
      while ((idx = data.indexOf(boundaryBuffer)) !== -1) {
        const part = data.slice(0, idx);
        fileStream.write(part);
        fileInfo.size += part.length;
        if (fileInfo.size > maxFileSize) return finish('File exceeds size limit');
        fileStream.end();
        data = data.slice(idx + boundaryBuffer.length);
        if (data.indexOf('--') === 0) data = data.slice(2);
        remainder = Buffer.alloc(0);
        return;
      }
      if (data.length > endBoundaryBuffer.length) {
        const safeLen = data.length - endBoundaryBuffer.length;
        const writePart = data.slice(0, safeLen);
        fileStream.write(writePart);
        fileInfo.size += writePart.length;
        if (fileInfo.size > maxFileSize) return finish('File exceeds size limit');
        remainder = data.slice(safeLen);
      } else {
        remainder = data;
      }
    }
  };
}

module.exports = createUploadMiddleware;
