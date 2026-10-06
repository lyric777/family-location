import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 8787);
const families = new Map();
const invites = new Map();
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
};
const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};
const inviteCode = () => randomBytes(4).toString('base64url').replace(/[-_]/g, '').slice(0, 6).toUpperCase();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true });

    if (req.method === 'POST' && req.url === '/v1/families') {
      const body = await readBody(req);
      if (!body.ownerDeviceId) return json(res, 400, { error: 'ownerDeviceId required' });
      const familyId = 'fam_' + randomUUID();
      let code = inviteCode();
      while (invites.has(code)) code = inviteCode();
      const family = { familyId, inviteCode: code, members: new Map([[body.ownerDeviceId, { deviceId: body.ownerDeviceId, publicKey: body.ownerPublicKey || '' }]]) };
      families.set(familyId, family);
      invites.set(code, familyId);
      return json(res, 201, { familyId, inviteCode: code, members: [...family.members.values()] });
    }

    if (req.method === 'POST' && req.url === '/v1/families/join') {
      const body = await readBody(req);
      const familyId = invites.get(String(body.inviteCode || '').toUpperCase());
      const family = familyId && families.get(familyId);
      if (!family) return json(res, 404, { error: 'Invite code not found' });
      if (!body.deviceId) return json(res, 400, { error: 'deviceId required' });
      family.members.set(body.deviceId, { deviceId: body.deviceId, publicKey: body.devicePublicKey || '' });
      return json(res, 200, { familyId, members: [...family.members.values()] });
    }

    const match = req.url?.match(/^\/v1\/families\/([^/]+)\/members$/);
    if (req.method === 'GET' && match) {
      const family = families.get(decodeURIComponent(match[1]));
      if (!family) return json(res, 404, { error: 'Family not found' });
      return json(res, 200, { familyId: family.familyId, members: [...family.members.values()] });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
server.listen(port, '0.0.0.0', () => console.log('Family relay listening on http://0.0.0.0:' + port));
