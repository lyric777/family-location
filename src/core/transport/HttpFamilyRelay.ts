import Constants from 'expo-constants';
import FamilyLocation from '../../../modules/family-location';
import type { CreateFamilyRequest, CreateFamilyResponse, JoinFamilyRequest, JoinFamilyResponse } from '../family/protocol';
import type { OwnerRevocationStatement } from '../family/ownerRevocation';

export type RelayMember = { deviceId: string; publicKey: string };
export type RelayFamily = { familyId: string; members: RelayMember[] };

export type RelayRevocationEvidence = { statement: OwnerRevocationStatement; signature: string };

export class RelayHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly requestPath: string,
    message: string,
    readonly revocation: RelayRevocationEvidence | null = null,
  ) {
    super(message);
    this.name = 'RelayHttpError';
  }
}

export class HttpFamilyRelay {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = this.baseUrl + path;
    const method = init?.method ?? 'GET';
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      console.info('[FamilyRelay] request', method, url);
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
      const body = await response.json();
      console.info('[FamilyRelay] response', method, url, response.status, Date.now() - startedAt, 'ms');
      if (!response.ok) throw new RelayHttpError(
        response.status,
        typeof body.code === 'string' ? body.code : null,
        path,
        typeof body.error === 'string' ? body.error : 'Relay request failed',
        body.revocation && typeof body.revocation === 'object' &&
          typeof body.revocation.signature === 'string' && body.revocation.statement &&
          typeof body.revocation.statement === 'object'
          ? body.revocation as RelayRevocationEvidence : null,
      );
      return body as T;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn('[FamilyRelay] failure', method, url, Date.now() - startedAt, 'ms', reason);
      if (error instanceof RelayHttpError) throw error;
      throw new Error(method + ' ' + url + ': ' + reason);
    } finally {
      clearTimeout(timeout);
    }
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

  revokeMember(familyId: string, deviceId: string, statement: OwnerRevocationStatement, signature: string) {
    return this.authorized<{ keyEpoch: number; rotationRequired: boolean }>(familyId, 'revoke', '/v1/families/' + encodeURIComponent(familyId) + '/revoke', {
      method: 'POST', body: JSON.stringify({ deviceId, statement, signature }),
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
