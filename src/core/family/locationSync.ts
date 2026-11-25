import FamilyLocation, { type NativeLocationSnapshot } from '../../../modules/family-location';
import type { HttpFamilyRelay } from '../transport/HttpFamilyRelay';
import type { EncryptedEnvelope, LocationPayload } from './protocol';

function aadFor(envelope: Pick<EncryptedEnvelope, 'version' | 'familyId' | 'senderDeviceId' | 'messageId' | 'sentAtMs' | 'kind'>) {
  return JSON.stringify(['family-location-v1', envelope.version, envelope.familyId,
    envelope.senderDeviceId, envelope.messageId, envelope.sentAtMs, envelope.kind]);
}

function validPosition(p: LocationPayload) {
  return Number.isFinite(p.latitude) && p.latitude >= -90 && p.latitude <= 90 &&
    Number.isFinite(p.longitude) && p.longitude >= -180 && p.longitude <= 180 &&
    Number.isFinite(p.accuracyMeters) && p.accuracyMeters >= 0 &&
    Number.isSafeInteger(p.timestampMs) && p.timestampMs > 0 &&
    ['idle', 'moving', 'live'].includes(p.mode);
}

export async function publishCurrentLocation(relay: HttpFamilyRelay, familyId: string, snapshot: NativeLocationSnapshot) {
  if (snapshot.latitude == null || snapshot.longitude == null ||
      snapshot.accuracyMeters == null || snapshot.timestampMs == null) {
    throw new Error('No location fix available yet');
  }
  const payload: LocationPayload = {
    latitude: snapshot.latitude, longitude: snapshot.longitude,
    accuracyMeters: snapshot.accuracyMeters, timestampMs: snapshot.timestampMs,
    mode: snapshot.mode.toLowerCase() as LocationPayload['mode'],
  };
  if (!validPosition(payload)) throw new Error('Invalid location fix');
  const identity = await FamilyLocation.getDeviceIdentity();
  const envelopeBase = {
    version: 1 as const, familyId, senderDeviceId: identity.deviceId,
    messageId: 'loc_' + Date.now() + '_' + Math.random().toString(36).slice(2),
    sentAtMs: Date.now(), kind: 'location' as const,
  };
  const encrypted = await FamilyLocation.encryptFamilyPayload(familyId, JSON.stringify(payload), aadFor(envelopeBase));
  await relay.publishLocation(familyId, { ...envelopeBase, ...encrypted });
}

export async function readFamilyLocations(relay: HttpFamilyRelay, familyId: string) {
  const response = await relay.getSnapshot(familyId);
  if (response.familyId !== familyId) throw new Error('Snapshot family mismatch');
  const result: Array<{ deviceId: string; location: LocationPayload }> = [];
  for (const entry of response.devices) {
    const e = entry.envelope;
    if (entry.deviceId !== e.senderDeviceId || e.familyId !== familyId ||
        e.version !== 1 || e.kind !== 'location') continue;
    try {
      const plaintext = await FamilyLocation.decryptFamilyPayload(familyId, e.nonce, e.ciphertext, aadFor(e));
      const location = JSON.parse(plaintext) as LocationPayload;
      if (validPosition(location) && location.timestampMs <= e.sentAtMs + 60_000) {
        result.push({ deviceId: e.senderDeviceId, location });
      }
    } catch {
      // A corrupted or stale envelope must not prevent reading other members.
    }
  }
  return result;
}
