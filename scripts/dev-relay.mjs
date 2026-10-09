import http from 'node:http';
import { randomInt, randomUUID, createHash, createPublicKey, verify } from 'node:crypto';

const port = Number(process.env.PORT || 8787);
const families = new Map();
const invites = new Map();
const challenges = new Map();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const read = async (req) => { const chunks = []; for await (const chunk of req) chunks.push(chunk); if (Buffer.concat(chunks).length > 32768) throw Error('Request too large'); return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); };
const deviceIdFor = (key) => 'dev_' + createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex');
const validKey = (key) => { try { const parsed = createPublicKey({ key: Buffer.from(key, 'base64'), format: 'der', type: 'spki' }); return parsed.asymmetricKeyType === 'ec' && parsed.asymmetricKeyDetails?.namedCurve === 'prime256v1'; } catch { return false; } };
const member = (family, deviceId) => family?.members.get(deviceId);
const publicMembers = (family) => [...family.members].map(([deviceId, data]) => ({ deviceId, publicKey: data.publicKey }));
const authenticate = (req, family, action) => {
  const deviceId = req.headers['x-device-id'];
  const nonce = req.headers['x-auth-nonce'];
  const signature = req.headers['x-auth-signature'];
  const entry = member(family, deviceId);
  const challenge = challenges.get(nonce);
  if (!entry || !challenge || challenge.deviceId !== deviceId || challenge.familyId !== family.familyId || challenge.action !== action || challenge.expiresAt < Date.now()) return false;
  challenges.delete(nonce);
  try {
    return verify('sha256', Buffer.from(action + ':' + family.familyId + ':' + nonce), createPublicKey({ key: Buffer.from(entry.publicKey, 'base64'), format: 'der', type: 'spki' }), Buffer.from(signature, 'base64'));
  } catch { return false; }
};

http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true });
    if (req.method === 'POST' && req.url === '/v1/families') {
      const b = await read(req);
      if (!validKey(b.ownerPublicKey) || deviceIdFor(b.ownerPublicKey) !== b.ownerDeviceId) return json(res, 400, { error: 'Invalid device identity' });
      const familyId = 'fam_' + randomUUID();
      let inviteCode = code(); while (invites.has(inviteCode)) inviteCode = code();
      const family = { familyId, members: new Map([[b.ownerDeviceId, { publicKey: b.ownerPublicKey }]]), latest: new Map() };
      families.set(familyId, family);
      invites.set(inviteCode, { familyId, expiresAt: Date.now() + 10 * 60_000, uses: 0 });
      return json(res, 201, { familyId, inviteCode, members: publicMembers(family) });
    }
    if (req.method === 'POST' && req.url === '/v1/families/join') {
      const b = await read(req);
      const invite = invites.get(String(b.inviteCode || '').toUpperCase());
      if (!invite || invite.expiresAt < Date.now() || invite.uses >= 1) return json(res, 404, { error: 'Invite invalid or expired' });
      if (!validKey(b.devicePublicKey) || deviceIdFor(b.devicePublicKey) !== b.deviceId) return json(res, 400, { error: 'Invalid device identity' });
      const family = families.get(invite.familyId);
      family.members.set(b.deviceId, { publicKey: b.devicePublicKey });
      invite.uses++;
      return json(res, 200, { familyId: family.familyId, members: publicMembers(family) });
    }
    if (req.method === 'POST' && req.url === '/v1/auth/challenge') {
      const b = await read(req);
      const family = families.get(b.familyId);
      if (!member(family, b.deviceId) || !['members', 'publish', 'snapshot'].includes(b.action)) return json(res, 403, { error: 'Not a family member' });
      const nonce = randomUUID();
      challenges.set(nonce, { deviceId: b.deviceId, familyId: b.familyId, action: b.action, expiresAt: Date.now() + 60_000 });
      return json(res, 200, { nonce });
    }
    const match = req.url?.match(/^\/v1\/families\/([^/]+)\/(members|locations|snapshot)$/);
    if (!match) return json(res, 404, { error: 'Not found' });
    const family = families.get(decodeURIComponent(match[1]));
    if (!family) return json(res, 404, { error: 'Not found' });
    const action = match[2] === 'locations' ? 'publish' : match[2];
    if (!authenticate(req, family, action)) return json(res, 403, { error: 'Authentication failed' });
    if (req.method === 'GET' && action === 'members') return json(res, 200, { familyId: family.familyId, members: publicMembers(family) });
    if (req.method === 'GET' && action === 'snapshot') return json(res, 200, { familyId: family.familyId, devices: [...family.latest.values()] });
    if (req.method === 'POST' && action === 'publish') {
      const b = await read(req);
      const e = b.envelope;
      if (!e || e.version !== 1 || e.kind !== 'location' || e.familyId !== family.familyId || e.senderDeviceId !== req.headers['x-device-id'] || typeof e.ciphertext !== 'string' || typeof e.nonce !== 'string' || !Number.isFinite(e.sentAtMs)) return json(res, 400, { error: 'Invalid envelope' });
      const previous = family.latest.get(e.senderDeviceId);
      if (previous && e.sentAtMs <= previous.envelope.sentAtMs) return json(res, 409, { error: 'Stale location' });
      family.latest.set(e.senderDeviceId, { deviceId: e.senderDeviceId, envelope: e, receivedAtMs: Date.now() });
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch { return json(res, 400, { error: 'Invalid request' }); }
}).listen(port, '0.0.0.0', () => console.log('Family relay listening on port ' + port));
