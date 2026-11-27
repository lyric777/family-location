import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import net from 'node:net';

const identity = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const der = publicKey.export({ format: 'der', type: 'spki' });
  return { privateKey, publicKey: der.toString('base64'),
    deviceId: 'dev_' + createHash('sha256').update(der).digest('hex') };
};
async function request(base, path, method = 'GET', payload, headers = {}) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers },
    ...(method === 'POST' ? { body } : {}) });
  return { status: res.status, data: await res.json() };
}
async function auth(base, who, familyId, action, path, method = 'GET', payload) {
  const challenge = await request(base, '/v1/auth/challenge', 'POST',
    { deviceId: who.deviceId, familyId, action });
  if (challenge.status !== 200) return challenge;
  const body = payload === undefined ? '' : JSON.stringify(payload);
  const message = JSON.stringify([action, familyId, challenge.data.nonce, method, path,
    createHash('sha256').update(body).digest('hex')]);
  return request(base, path, method, payload, {
    'x-device-id': who.deviceId, 'x-auth-nonce': challenge.data.nonce,
    'x-auth-signature': sign('sha256', Buffer.from(message), who.privateKey).toString('base64'),
  });
}

test('encrypted location relay: isolation, freshness, replay and revocation', async t => {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const server = spawn(process.execPath, ['scripts/dev-relay.mjs'],
    { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  t.after(() => server.kill());
  const base = 'http://127.0.0.1:' + port;
  let up = false;
  for (let i = 0; i < 80; i++) {
    try { if ((await request(base, '/health')).status === 200) { up = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(up);
  const owner = identity(), member = identity(), outsider = identity();
  const created = await request(base, '/v1/families', 'POST',
    { ownerDeviceId: owner.deviceId, ownerPublicKey: owner.publicKey });
  const { familyId, inviteCode } = created.data;
  assert.equal((await request(base, '/v1/families/join', 'POST',
    { inviteCode, deviceId: member.deviceId, devicePublicKey: member.publicKey })).status, 200);
  const path = suffix => '/v1/families/' + encodeURIComponent(familyId) + '/' + suffix;
  const now = Date.now();
  const envelope = { version: 1, familyId, senderDeviceId: owner.deviceId,
    messageId: 'location-test', sentAtMs: now, kind: 'location',
    nonce: randomBytes(12).toString('base64'), ciphertext: randomBytes(32).toString('base64') };
  const publish = e => auth(base, owner, familyId, 'publish', path('locations'), 'POST', { envelope: e });
  assert.equal((await publish(envelope)).status, 200);
  assert.equal((await publish(envelope)).status, 409);
  assert.equal((await publish({ ...envelope, sentAtMs: now - 1 })).status, 409);
  assert.equal((await publish({ ...envelope, familyId: 'other', sentAtMs: now + 1 })).status, 400);
  assert.equal((await publish({ ...envelope, senderDeviceId: outsider.deviceId, sentAtMs: now + 1 })).status, 400);
  assert.equal((await publish({ ...envelope, nonce: 'bad', sentAtMs: now + 1 })).status, 400);
  assert.equal((await publish({ ...envelope, sentAtMs: now - 600_000 })).status, 400);
  assert.equal((await publish({ ...envelope, sentAtMs: now + 600_000 })).status, 400);
  assert.equal((await auth(base, outsider, familyId, 'snapshot', path('snapshot'))).status, 403);
  const snap = await auth(base, member, familyId, 'snapshot', path('snapshot'));
  assert.equal(snap.status, 200);
  assert.deepEqual(snap.data.devices[0].envelope, envelope);
  assert.equal(JSON.stringify(snap.data).includes('latitude'), false);
  assert.equal((await auth(base, member, familyId, 'leave', path('leave'), 'POST', {})).status, 200);
  assert.equal((await auth(base, member, familyId, 'snapshot', path('snapshot'))).status, 403);
  assert.equal((await auth(base, owner, familyId, 'snapshot', path('snapshot'))).data.devices.length, 0);
  assert.equal((await publish({ ...envelope, sentAtMs: now + 2 })).status, 409);
});
