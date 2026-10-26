import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import net from 'node:net';

function identity() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const der = publicKey.export({ format: 'der', type: 'spki' });
  return { privateKey, publicKey: der.toString('base64'), deviceId: 'dev_' + createHash('sha256').update(der).digest('hex') };
}
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function request(base, path, method = 'GET', payload, headers = {}) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(method === 'POST' ? { body } : {}) });
  return { status: response.status, data: await response.json() };
}
async function authorized(base, device, familyId, action, path, method = 'GET', payload) {
  const challenge = await request(base, '/v1/auth/challenge', 'POST', { deviceId: device.deviceId, familyId, action });
  if (challenge.status !== 200) return challenge;
  const nonce = challenge.data.nonce;
  const body = payload === undefined ? '' : JSON.stringify(payload);
  const digest = createHash('sha256').update(body).digest('hex');
  const message = JSON.stringify([action, familyId, nonce, method, path, digest]);
  const signature = sign('sha256', Buffer.from(message), device.privateKey).toString('base64');
  return request(base, path, method, payload, {
    'x-device-id': device.deviceId,
    'x-auth-nonce': nonce,
    'x-auth-signature': signature,
  });
}

test('relay authentication, readiness, revocation and key epoch', async t => {
  const port = await freePort();
  const server = spawn(process.execPath, ['scripts/dev-relay.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  t.after(() => server.kill());
  const base = 'http://127.0.0.1:' + port;
  let healthy = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) break;
    try { if ((await request(base, '/health')).status === 200) { healthy = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(healthy, 'relay failed to start');
  const owner = identity(), member = identity(), stranger = identity();
  const created = await request(base, '/v1/families', 'POST', { ownerDeviceId: owner.deviceId, ownerPublicKey: owner.publicKey });
  assert.equal(created.status, 201);
  const { familyId, inviteCode } = created.data;
  const path = suffix => '/v1/families/' + encodeURIComponent(familyId) + '/' + suffix;

  assert.equal((await authorized(base, stranger, familyId, 'members', path('members'))).status, 403);
  assert.equal((await authorized(base, owner, familyId, 'members', path('members'))).status, 200);
  assert.equal((await request(base, '/v1/families/join', 'POST', { inviteCode, deviceId: member.deviceId, devicePublicKey: member.publicKey })).status, 200);
  assert.equal((await request(base, '/v1/families/join', 'POST', { inviteCode, deviceId: stranger.deviceId, devicePublicKey: stranger.publicKey })).status, 404);

  const confirm = randomBytes(32).toString('base64');
  assert.equal((await authorized(base, owner, familyId, 'key-ready', path('key-ready'), 'POST', { epoch: 1, confirmation: confirm })).status, 200);
  assert.equal((await authorized(base, owner, familyId, 'key-status', path('key-status'))).data.allReady, false);
  assert.equal((await authorized(base, member, familyId, 'key-ready', path('key-ready'), 'POST', { epoch: 1, confirmation: confirm })).status, 200);
  assert.equal((await authorized(base, member, familyId, 'key-status', path('key-status'))).data.allReady, true);

  assert.equal((await authorized(base, member, familyId, 'revoke', path('revoke'), 'POST', { deviceId: owner.deviceId })).status, 403);
  const revoked = await authorized(base, owner, familyId, 'revoke', path('revoke'), 'POST', { deviceId: member.deviceId });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.data.keyEpoch, 2);
  assert.equal((await authorized(base, member, familyId, 'members', path('members'))).status, 403);
  assert.equal((await authorized(base, owner, familyId, 'key-status', path('key-status'))).data.allReady, false);
  assert.equal((await authorized(base, owner, familyId, 'key-ready', path('key-ready'), 'POST', { epoch: 1, confirmation: confirm })).status, 400);
  assert.equal((await authorized(base, owner, familyId, 'rotation-complete', path('rotation-complete'), 'POST', { epoch: 2 })).status, 200);
  assert.equal((await authorized(base, owner, familyId, 'dissolve', path('dissolve'), 'POST', {})).status, 200);
  assert.equal((await authorized(base, owner, familyId, 'members', path('members'))).status, 403);
});
