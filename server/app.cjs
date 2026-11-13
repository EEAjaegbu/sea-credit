const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

// Static preview only. Accounts, password handling and application writes are owned by Supabase.
function createApp() {
  const root = path.resolve(__dirname, '..', 'dist');
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    function json(status, body) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    }
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return json(410, { error: 'The app now uses Supabase. Refresh the latest frontend instead of calling the retired local API.' });
      if (!['GET', 'HEAD'].includes(req.method)) return json(405, { error: 'Method not allowed.' });
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return json(400, { error: 'Invalid URL.' }); }
      const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8' };
      if (!file.startsWith(root + path.sep) || !types[path.extname(file)]) return json(404, { error:'Not found.' });
      let content;
      try { content = await fs.readFile(file); } catch { return json(404, { error:'Not found.' }); }
      res.writeHead(200, { 'Content-Type':types[path.extname(file)] });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch { json(500, { error:'Unable to load this page.' }); }
  });
  return { server };
}
module.exports = { createApp };
