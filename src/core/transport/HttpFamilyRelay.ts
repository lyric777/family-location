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

  private async authorized<T>(familyId: string, action: 'members' | 'publish' | 'snapshot' | 'key-register' | 'key-read' | 'key-send' | 'rotation-complete' | 'revoke' | 'leave' | 'dissolve' | 'key-ready' | 'key-status', path: string, init?: RequestInit): Promise<T> {
    const identity = await FamilyLocation.getDeviceIdentity();
    const { nonce } = await this.request<{ nonce: string }>('/v1/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({ familyId, deviceId: identity.deviceId, action }),
    });
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : '';
    const digest = await FamilyLocation.sha256Hex(body);
    const signedMessage = JSON.stringify([action, familyId, nonce, method, path, digest]);
    const signature = await FamilyLocation.signIdentityChallenge(signedMessage);
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

  registerExchangeKey(familyId: string, exchangePublicKey: string, bindingSignature: string) {
    return this.authorized<{ ok: boolean }>(familyId, 'key-register', '/v1/families/' + encodeURIComponent(familyId) + '/key-register', {
      method: 'POST', body: JSON.stringify({ exchangePublicKey, bindingSignature }),
    });
  }

  getKeyExchange(familyId: string) {
    return this.authorized<{
      members: Array<{ deviceId: string; identityPublicKey: string; exchangePublicKey: string; bindingSignature: string }>;
      packages: Array<{ recipientDeviceId: string; senderDeviceId: string; nonce: string; ciphertext: string; epoch: number }>;
      keyEpoch: number; ownerDeviceId: string; rotationRequired: boolean;
    }>(familyId, 'key-read', '/v1/families/' + encodeURIComponent(familyId) + '/key-read');
  }

  sendKeyPackage(familyId: string, recipientDeviceId: string, nonce: string, ciphertext: string, epoch: number) {
    return this.authorized<{ ok: boolean }>(familyId, 'key-send', '/v1/families/' + encodeURIComponent(familyId) + '/key-send', {
      method: 'POST', body: JSON.stringify({ recipientDeviceId, nonce, ciphertext, epoch }),
    });
  }

  completeRotation(familyId: string, epoch: number) {
    return this.authorized<{ keyEpoch: number; rotationRequired: boolean }>(familyId, 'rotation-complete', '/v1/families/' + encodeURIComponent(familyId) + '/rotation-complete', {
      method: 'POST', body: JSON.stringify({ epoch }),
    });
  }

  dissolveFamily(familyId: string) {
    return this.authorized<{ ok: boolean }>(familyId, 'dissolve', '/v1/families/' + encodeURIComponent(familyId) + '/dissolve', {
      method: 'POST', body: '{}',
    });
  }

  leaveFamily(familyId: string) {
    return this.authorized<{ ok: boolean; keyEpoch: number; rotationRequired: boolean }>(
      familyId, 'leave', '/v1/families/' + encodeURIComponent(familyId) + '/leave', {
        method: 'POST', body: '{}',
      },
    );
  }

  revokeMember(familyId: string, deviceId: string) {
    return this.authorized<{ keyEpoch: number; rotationRequired: boolean }>(familyId, 'revoke', '/v1/families/' + encodeURIComponent(familyId) + '/revoke', {
      method: 'POST', body: JSON.stringify({ deviceId }),
    });
  }

  confirmFamilyKey(familyId: string, epoch: number, confirmation: string) {
    return this.authorized<{ ok: boolean }>(familyId, 'key-ready', '/v1/families/' + encodeURIComponent(familyId) + '/key-ready', {
      method: 'POST', body: JSON.stringify({ epoch, confirmation }),
    });
  }

  getFamilyKeyStatus(familyId: string) {
    return this.authorized<{ epoch: number; readyDeviceIds: string[]; allReady: boolean }>(
      familyId, 'key-status', '/v1/families/' + encodeURIComponent(familyId) + '/key-status');
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
