import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, sign, verify, createPublicKey } from 'node:crypto';
import net from 'node:net';

function identity() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const der = publicKey.export({ format: 'der', type: 'spki' });
  return { privateKey, publicKey: der.toString('base64'), deviceId: 'dev_' + createHash('sha256').update(der).digest('hex') };
}
async function request(base, path, method = 'GET', payload, headers = {}) {
  const response = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(payload ?? {}) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
async function signed(base, identity, familyId, action, path, method = 'GET', payload) {
  const challenge = await request(base, '/v1/auth/challenge', 'POST', { familyId, deviceId: identity.deviceId, action });
  if (challenge.status !== 200) return challenge;
  const body = method === 'POST' ? JSON.stringify(payload ?? {}) : '';
  const digest = createHash('sha256').update(body).digest('hex');
  const message = JSON.stringify([action, familyId, challenge.data.nonce, method, path, digest]);
  const signature = sign('sha256', Buffer.from(message), identity.privateKey).toString('base64');
  return request(base, path, method, payload, {
    'x-device-id': identity.deviceId, 'x-auth-nonce': challenge.data.nonce,
    'x-auth-signature': signature,
  });
}
test('revoked member has a distinct challenge error', async t => {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const server = spawn(process.execPath, ['scripts/dev-relay.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  t.after(() => server.kill());
  const base = 'http://127.0.0.1:' + port;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await request(base, '/health')).status === 200; if (ready) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready);
  const owner = identity(), member = identity(), unknown = identity();
  const created = await request(base, '/v1/families', 'POST', { ownerDeviceId: owner.deviceId, ownerPublicKey: owner.publicKey });
  assert.equal(created.status, 201);
  const { familyId, inviteCode } = created.data;
  assert.equal((await request(base, '/v1/families/join', 'POST', {
    inviteCode, deviceId: member.deviceId, devicePublicKey: member.publicKey,
  })).status, 200);
  const membersPath = '/v1/families/' + encodeURIComponent(familyId) + '/members';
  const revokePath = '/v1/families/' + encodeURIComponent(familyId) + '/revoke';
  const before = await signed(base, unknown, familyId, 'members', membersPath);
  assert.equal(before.status, 403);
  assert.equal(before.data.error, 'Not a family member');
  assert.notEqual(before.data.code, 'MEMBERSHIP_REVOKED');
  const statement = { version: 1, action: 'revoke', familyId, ownerDeviceId: owner.deviceId, memberDeviceId: member.deviceId, keyEpoch: 2 };
  const signature = sign('sha256', Buffer.from(JSON.stringify([
    'family-revocation-v1', familyId, owner.deviceId, member.deviceId, 2,
  ])), owner.privateKey).toString('base64');
  assert.equal((await signed(base, owner, familyId, 'revoke', revokePath, 'POST',
    { deviceId: member.deviceId, statement, signature })).status, 200);
  const after = await signed(base, member, familyId, 'members', membersPath);
  assert.equal(after.status, 403);
  assert.equal(after.data.code, 'MEMBERSHIP_REVOKED');
  assert.deepEqual(after.data.revocation?.statement, statement);
  assert.equal(after.data.revocation?.signature, signature);
  const revokedMessage = JSON.stringify([
    'family-revocation-v1', familyId, owner.deviceId, member.deviceId, 2,
  ]);
  assert.equal(verify('sha256', Buffer.from(revokedMessage), createPublicKey(owner.privateKey),
    Buffer.from(after.data.revocation.signature, 'base64')), true);
  assert.equal((await signed(base, member, familyId, 'key-read', '/v1/families/' + encodeURIComponent(familyId) + '/key-read')).status, 403);
  assert.equal((await signed(base, owner, familyId, 'members', membersPath)).status, 200);
});
