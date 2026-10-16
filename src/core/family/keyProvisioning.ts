import FamilyLocation from '../../../modules/family-location';
import type { HttpFamilyRelay } from '../transport/HttpFamilyRelay';

type ExchangeMember = {
  deviceId: string;
  identityPublicKey: string;
  exchangePublicKey: string;
  bindingSignature: string;
};

function bindingMessage(familyId: string, deviceId: string, exchangePublicKey: string) {
  return JSON.stringify(['exchange-key-v1', familyId, deviceId, exchangePublicKey]);
}

async function verifiedMembers(familyId: string, members: ExchangeMember[]) {
  const result = new Map<string, ExchangeMember>();
  for (const member of members) {
    const hash = await FamilyLocation.sha256HexBase64(member.identityPublicKey);
    if ('dev_' + hash !== member.deviceId) throw new Error('Device identity mismatch');
    const ok = await FamilyLocation.verifyIdentitySignature(
      member.identityPublicKey,
      bindingMessage(familyId, member.deviceId, member.exchangePublicKey),
      member.bindingSignature,
    );
    if (!ok) throw new Error('Invalid exchange key binding');
    result.set(member.deviceId, member);
  }
  return result;
}

export async function registerOwnExchangeKey(relay: HttpFamilyRelay, familyId: string) {
  const identity = await FamilyLocation.getDeviceIdentity();
  const exchangePublicKey = await FamilyLocation.getExchangePublicKey();
  const bindingSignature = await FamilyLocation.signIdentityChallenge(
    bindingMessage(familyId, identity.deviceId, exchangePublicKey),
  );
  await relay.registerExchangeKey(familyId, exchangePublicKey, bindingSignature);
}

export async function provisionFamilyKey(relay: HttpFamilyRelay, familyId: string, owner: boolean) {
  await registerOwnExchangeKey(relay, familyId);
  const identity = await FamilyLocation.getDeviceIdentity();
  const exchange = await relay.getKeyExchange(familyId);
  const members = await verifiedMembers(familyId, exchange.members);
  if (owner) {
    await FamilyLocation.createFamilyKey(familyId);
    for (const member of members.values()) {
      if (member.deviceId === identity.deviceId) continue;
      const wrapped = await FamilyLocation.exportFamilyKeyForMember(familyId, member.exchangePublicKey, identity.deviceId, member.deviceId, 1);
      await relay.sendKeyPackage(familyId, member.deviceId, wrapped.nonce, wrapped.ciphertext);
    }
    return true;
  }
  if (await FamilyLocation.hasFamilyKey(familyId)) return true;
  for (const packet of exchange.packages) {
    const sender = members.get(packet.senderDeviceId);
    if (!sender || packet.recipientDeviceId !== identity.deviceId) continue;
    await FamilyLocation.importFamilyKeyFromMember(
      familyId, sender.exchangePublicKey, packet.nonce, packet.ciphertext,
      packet.senderDeviceId, packet.recipientDeviceId, 1,
    );
    return true;
  }
  return false;
}
