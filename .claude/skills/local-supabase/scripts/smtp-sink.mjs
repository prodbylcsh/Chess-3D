// Stand-in for Mailpit when its image can't be pulled (Docker Hub rate limits).
// Accepts mail from the auth server on :1025 and serves the subset of Mailpit's
// HTTP API the tests use on :8025:
//   GET    /api/v1/messages      → { messages: [{ ID, Subject, To: [{ Address }], Created }] }
//   GET    /api/v1/message/<ID>  → { ID, Subject, To, Text, HTML }
//   DELETE /api/v1/messages      → clears the inbox
// Messages live in memory only.
import http from 'node:http';
import net from 'node:net';

const messages = [];
let nextId = 1;

/** Undo quoted-printable encoding (what the auth server's mails use). */
function decodeQP(text) {
  const bytes = [];
  const soft = text.replace(/=\r?\n/g, '');
  for (let i = 0; i < soft.length; i++) {
    if (soft[i] === '=' && /^[0-9A-F]{2}$/i.test(soft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(...Buffer.from(soft[i]));
  }
  return Buffer.from(bytes).toString('utf8');
}

/** Decode RFC 2047 words in headers ("=?UTF-8?q?Potvr=C4=8F?="), as Mailpit does. */
function decodeHeader(value) {
  return value
    .replace(/(\?=)\s+(=\?)/g, '$1$2') // whitespace between encoded words is not text
    .replace(/=\?([^?]+)\?([QB])\?([^?]*)\?=/gi, (_, _charset, kind, text) =>
      kind.toUpperCase() === 'B'
        ? Buffer.from(text, 'base64').toString('utf8')
        : decodeQP(text.replace(/_/g, ' ')),
    );
}

function parse(raw, rcpt) {
  const split = raw.indexOf('\r\n\r\n');
  const head = raw.slice(0, split).replace(/\r\n[ \t]+/g, ' ');
  const body = raw.slice(split + 4);
  const header = (name) => head.match(new RegExp(`^${name}:\\s*(.*)$`, 'im'))?.[1] ?? '';
  const qp = /quoted-printable/i.test(head) || /quoted-printable/i.test(body);
  const decoded = qp ? decodeQP(body) : body;
  const html = decoded.match(/<html[\s\S]*<\/html>/i)?.[0] ?? (/<a\s/i.test(decoded) ? decoded : '');
  return {
    ID: String(nextId++),
    Subject: decodeHeader(header('Subject')),
    To: rcpt.map((a) => ({ Address: a })),
    Created: new Date().toISOString(),
    Text: decoded.replace(/<[^>]+>/g, ''),
    HTML: html,
  };
}

net
  .createServer((socket) => {
    let buffer = '';
    let data = false;
    let rcpt = [];
    const say = (line) => socket.write(`${line}\r\n`);
    say('220 smtp-sink ready');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        if (data) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) return;
          messages.unshift(parse(buffer.slice(0, end).replace(/\r\n\.\./g, '\r\n.'), rcpt));
          buffer = buffer.slice(end + 5);
          data = false;
          rcpt = [];
          say('250 queued');
          continue;
        }
        const nl = buffer.indexOf('\r\n');
        if (nl === -1) return;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') socket.write('250-smtp-sink\r\n250 8BITMIME\r\n');
        else if (cmd === 'HELO') say('250 smtp-sink');
        else if (cmd === 'RCPT') {
          rcpt.push(line.match(/<([^>]*)>/)?.[1] ?? '');
          say('250 ok');
        } else if (cmd === 'DATA') {
          data = true;
          say('354 end with <CRLF>.<CRLF>');
        } else if (cmd === 'QUIT') {
          say('221 bye');
          socket.end();
        } else say('250 ok'); // MAIL, RSET, NOOP
      }
    });
    socket.on('error', () => {});
  })
  .listen(1025, '0.0.0.0');

http
  .createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/api/v1/messages' && req.method === 'DELETE') {
      messages.length = 0;
      return send(200, { ok: true });
    }
    if (req.url?.startsWith('/api/v1/messages')) {
      return send(200, { messages: messages.map(({ Text: _t, HTML: _h, ...m }) => m), total: messages.length });
    }
    const one = req.url?.match(/^\/api\/v1\/message\/([^/?]+)/);
    if (one) {
      const id = one[1] === 'latest' ? messages[0]?.ID : one[1];
      const message = messages.find((m) => m.ID === id);
      return message ? send(200, message) : send(404, { error: 'not found' });
    }
    send(404, { error: 'not found' });
  })
  .listen(8025, '0.0.0.0');

console.log('smtp-sink: SMTP :1025, API :8025');
