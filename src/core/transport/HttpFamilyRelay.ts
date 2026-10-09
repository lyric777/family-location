import Constants from 'expo-constants';
import FamilyLocation from '../../../modules/family-location';
import type { CreateFamilyRequest, CreateFamilyResponse, JoinFamilyRequest, JoinFamilyResponse } from '../family/protocol';

export type RelayMember = { deviceId: string; publicKey: string };
export type RelayFamily = { familyId: string; members: RelayMember[] };

export class HttpFamilyRelay {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(this.baseUrl + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Relay request failed');
    return body as T;
  }

  createFamily(request: CreateFamilyRequest) {
    return this.request<CreateFamilyResponse & { members: RelayMember[] }>('/v1/families', { method: 'POST', body: JSON.stringify(request) });
  }

  joinFamily(request: JoinFamilyRequest) {
    return this.request<JoinFamilyResponse>('/v1/families/join', { method: 'POST', body: JSON.stringify(request) });
  }

  private async authorized<T>(familyId: string, action: 'members' | 'publish' | 'snapshot', path: string, init?: RequestInit): Promise<T> {
    const identity = await FamilyLocation.getDeviceIdentity();
    const { nonce } = await this.request<{ nonce: string }>('/v1/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({ familyId, deviceId: identity.deviceId, action }),
    });
    const signature = await FamilyLocation.signIdentityChallenge(action + ':' + familyId + ':' + nonce);
    return this.request<T>(path, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        'x-device-id': identity.deviceId,
        'x-auth-nonce': nonce,
        'x-auth-signature': signature,
      },
    });
  }

  getMembers(familyId: string) {
    return this.authorized<RelayFamily>(familyId, 'members', '/v1/families/' + encodeURIComponent(familyId) + '/members');
  }

  publishLocation(familyId: string, envelope: import('../family/protocol').EncryptedEnvelope) {
    return this.authorized<{ ok: boolean }>(familyId, 'publish', '/v1/families/' + encodeURIComponent(familyId) + '/locations', {
      method: 'POST', body: JSON.stringify({ envelope }),
    });
  }

  getSnapshot(familyId: string) {
    return this.authorized<import('../family/protocol').FamilySnapshotResponse>(familyId, 'snapshot', '/v1/families/' + encodeURIComponent(familyId) + '/snapshot');
  }
}

export function getConfiguredRelay() {
  const configured = Constants.expoConfig?.extra?.relayUrl;
  const url = typeof configured === 'string' ? configured.replace(/\/$/, '') : '';
  return url ? new HttpFamilyRelay(url) : null;
}
