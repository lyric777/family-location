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
