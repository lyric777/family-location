import FamilyLocation from '../../../modules/family-location';
import type { DeviceIdentity, FamilyId } from './protocol';

export type LocalFamilyState = {
  device: DeviceIdentity;
  familyId: FamilyId | null;
  inviteCode: string | null;
  role: 'owner' | 'member' | null;
  memberDeviceIds: string[];
};

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let state: LocalFamilyState | null = null;
const randomChars = (length: number) => Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
const makeId = (prefix: string) => prefix + '_' + Date.now().toString(36) + '_' + randomChars(10).toLowerCase();

export async function initializeFamilyState() {
  const identity = await FamilyLocation.getDeviceIdentity();
  const current = getOrCreateLocalFamilyState();
  const raw = await FamilyLocation.getFamilyMembership();
  let membership: Pick<LocalFamilyState, 'familyId' | 'inviteCode' | 'role' | 'memberDeviceIds'> | null = null;
  if (raw) {
    try { membership = JSON.parse(raw); } catch { membership = null; }
  }
  state = {
    ...current,
    device: { deviceId: identity.deviceId, displayName: identity.displayName, createdAtMs: current.device.createdAtMs },
    ...(membership ?? { familyId: null, inviteCode: null, role: null, memberDeviceIds: [] }),
  };
  return state;
}

export async function persistFamilyState() {
  const current = getOrCreateLocalFamilyState();
  await FamilyLocation.saveFamilyMembership(JSON.stringify({
    familyId: current.familyId, inviteCode: current.inviteCode,
    role: current.role, memberDeviceIds: current.memberDeviceIds,
  }));
}

export async function clearPersistedFamily() {
  await FamilyLocation.clearFamilyMembership();
  return resetLocalFamily();
}

export function getOrCreateLocalFamilyState(): LocalFamilyState {
  if (!state) state = { device: { deviceId: makeId('dev'), displayName: 'This phone', createdAtMs: Date.now() }, familyId: null, inviteCode: null, role: null, memberDeviceIds: [] };
  return state;
}

export function applyCreatedFamily(familyId: string, inviteCode: string, memberDeviceIds: string[]) {
  const current = getOrCreateLocalFamilyState();
  state = { ...current, familyId, inviteCode, role: 'owner', memberDeviceIds };
  return state;
}

export function applyJoinedFamily(familyId: string, inviteCode: string, memberDeviceIds: string[]) {
  const current = getOrCreateLocalFamilyState();
  state = { ...current, familyId, inviteCode: inviteCode.toUpperCase(), role: 'member', memberDeviceIds };
  return state;
}

export function updateMembers(memberDeviceIds: string[]) {
  const current = getOrCreateLocalFamilyState();
  state = { ...current, memberDeviceIds };
  return state;
}

export function resetLocalFamily() {
  const current = getOrCreateLocalFamilyState();
  state = { ...current, familyId: null, inviteCode: null, role: null, memberDeviceIds: [] };
  return state;
}
