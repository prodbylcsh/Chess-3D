// Minimal npm registry mirror for containers that cannot reach registry.npmjs.org
// directly: forwards requests (through the proxy when NODE_USE_ENV_PROXY=1) and rewrites
// tarball URLs to point back at itself.
import http from 'node:http';
const PORT = 4873, UP = 'https://registry.npmjs.org';
http.createServer(async (req, res) => {
  try {
    const up = await fetch(UP + req.url, { headers: { accept: req.headers.accept ?? '*/*' } });
    const type = up.headers.get('content-type') ?? '';
    res.writeHead(up.status, { 'content-type': type });
    if (type.includes('json')) {
      const self = `http://${req.headers.host}`;
      res.end((await up.text()).replaceAll(UP, self));
    } else res.end(Buffer.from(await up.arrayBuffer()));
  } catch (e) { res.writeHead(502); res.end(String(e)); }
}).listen(PORT, '0.0.0.0', () => console.log('mirror on', PORT));
