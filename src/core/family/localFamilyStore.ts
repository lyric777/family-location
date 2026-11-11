import FamilyLocation from '../../../modules/family-location';
import type { DeviceIdentity, FamilyId } from './protocol';

export type LocalFamilyState = {
  device: DeviceIdentity;
  familyId: FamilyId | null;
  inviteCode: string | null;
  role: 'owner' | 'member' | null;
  memberDeviceIds: string[];
  ownerDeviceId: string | null;
  ownerPublicKey: string | null;
};

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let state: LocalFamilyState | null = null;
const randomChars = (length: number) => Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
const makeId = (prefix: string) => prefix + '_' + Date.now().toString(36) + '_' + randomChars(10).toLowerCase();

export async function initializeFamilyState() {
  const identity = await FamilyLocation.getDeviceIdentity();
  const current = getOrCreateLocalFamilyState();
  const raw = await FamilyLocation.getFamilyMembership();
  let membership: Pick<LocalFamilyState, 'familyId' | 'inviteCode' | 'role' | 'memberDeviceIds' | 'ownerDeviceId' | 'ownerPublicKey'> | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.pendingVerifiedRemoval && typeof parsed.pendingVerifiedRemoval.familyId === 'string' &&
          parsed.pendingVerifiedRemoval.familyId === parsed.familyId) {
        await completeVerifiedRemoval(parsed.pendingVerifiedRemoval.familyId);
      } else {
        membership = parsed;
      }
    } catch (error) {
      if (error instanceof SyntaxError) membership = null;
      else throw error;
    }
  }
  state = {
    ...current,
    device: { deviceId: identity.deviceId, displayName: identity.displayName, createdAtMs: current.device.createdAtMs },
    ...(membership ?? { familyId: null, inviteCode: null, role: null, memberDeviceIds: [] }),
    ownerDeviceId: membership?.ownerDeviceId ?? null,
    ownerPublicKey: membership?.ownerPublicKey ?? null,
  };
  return state;
}

export async function persistFamilyState() {
  const current = getOrCreateLocalFamilyState();
  const stored = await FamilyLocation.getFamilyMembership();
  if (stored) {
    const parsed = JSON.parse(stored);
    if (parsed?.pendingVerifiedRemoval) throw new Error('Verified removal is pending');
  }
  await FamilyLocation.saveFamilyMembership(JSON.stringify({
    familyId: current.familyId, inviteCode: current.inviteCode,
    role: current.role, memberDeviceIds: current.memberDeviceIds,
    ownerDeviceId: current.ownerDeviceId, ownerPublicKey: current.ownerPublicKey,
  }));
}

// A durable checkpoint is written only after the caller has verified the Owner signature.
// Repeating completion after a crash is safe; device identity keys are not touched.
export async function beginVerifiedRemoval(familyId: string) {
  const current = getOrCreateLocalFamilyState();
  if (current.familyId !== familyId) throw new Error('Family changed before removal checkpoint');
  await FamilyLocation.saveFamilyMembership(JSON.stringify({
    familyId,
    pendingVerifiedRemoval: { familyId },
  }));
}

export async function completeVerifiedRemoval(familyId: string) {
  const raw = await FamilyLocation.getFamilyMembership();
  if (!raw) return resetLocalFamily();
  const stored = JSON.parse(raw);
  if (stored?.familyId !== familyId ||
      stored?.pendingVerifiedRemoval?.familyId !== familyId) {
    throw new Error('Missing verified removal checkpoint');
  }
  await FamilyLocation.stop();
  await FamilyLocation.deleteFamilyKey(familyId);
  await FamilyLocation.clearFamilyMembership();
  return resetLocalFamily();
}

export async function clearPersistedFamily() {
  await FamilyLocation.clearFamilyMembership();
  return resetLocalFamily();
}

export function getOrCreateLocalFamilyState(): LocalFamilyState {
  if (!state) state = { device: { deviceId: makeId('dev'), displayName: 'This phone', createdAtMs: Date.now() }, familyId: null, inviteCode: null, role: null, memberDeviceIds: [], ownerDeviceId: null, ownerPublicKey: null };
  return state;
}

export function applyCreatedFamily(familyId: string, inviteCode: string, memberDeviceIds: string[]) {
  const current = getOrCreateLocalFamilyState();
  state = { ...current, familyId, inviteCode, role: 'owner', memberDeviceIds, ownerDeviceId: null, ownerPublicKey: null };
  return state;
}

export function applyJoinedFamily(familyId: string, inviteCode: string, memberDeviceIds: string[]) {
  const current = getOrCreateLocalFamilyState();
  state = { ...current, familyId, inviteCode: inviteCode.toUpperCase(), role: 'member', memberDeviceIds, ownerDeviceId: null, ownerPublicKey: null };
  return state;
}

export function updateMembers(memberDeviceIds: string[]) {
  const current = getOrCreateLocalFamilyState();
  state = { ...current, memberDeviceIds };
  return state;
}

export function pinFamilyOwner(familyId: string, deviceId: string, publicKey: string) {
  const current = getOrCreateLocalFamilyState();
  if (current.familyId !== familyId) throw new Error('Family changed during owner verification');
  if ((current.ownerDeviceId && current.ownerDeviceId !== deviceId) ||
      (current.ownerPublicKey && current.ownerPublicKey !== publicKey)) {
    throw new Error('Pinned family owner identity mismatch');
  }
  state = { ...current, ownerDeviceId: deviceId, ownerPublicKey: publicKey };
  return state;
}

export function resetLocalFamily() {
  const current = getOrCreateLocalFamilyState();
  state = { ...current, familyId: null, inviteCode: null, role: null, memberDeviceIds: [], ownerDeviceId: null, ownerPublicKey: null };
  return state;
}
