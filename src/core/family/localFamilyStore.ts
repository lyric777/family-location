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

function randomChars(length: number) {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

function makeId(prefix: string) {
  return prefix + '_' + Date.now().toString(36) + '_' + randomChars(10).toLowerCase();
}

export function getOrCreateLocalFamilyState(): LocalFamilyState {
  if (!state) {
    state = {
      device: { deviceId: makeId('dev'), displayName: 'This phone', createdAtMs: Date.now() },
      familyId: null,
      inviteCode: null,
      role: null,
      memberDeviceIds: [],
    };
  }
  return state;
}

export function createLocalFamily(): LocalFamilyState {
  const current = getOrCreateLocalFamilyState();
  state = {
    ...current,
    familyId: makeId('fam'),
    inviteCode: randomChars(6),
    role: 'owner',
    memberDeviceIds: [current.device.deviceId],
  };
  return state;
}

export function joinLocalFamily(inviteCode: string): LocalFamilyState {
  const current = getOrCreateLocalFamilyState();
  const normalized = inviteCode.trim().toUpperCase();
  if (normalized.length !== 6) throw new Error('Invite code must be 6 characters');
  state = {
    ...current,
    familyId: 'pending_' + normalized.toLowerCase(),
    inviteCode: normalized,
    role: 'member',
    memberDeviceIds: [current.device.deviceId],
  };
  return state;
}

export function resetLocalFamily() {
  const current = getOrCreateLocalFamilyState();
  state = { ...current, familyId: null, inviteCode: null, role: null, memberDeviceIds: [] };
  return state;
}
