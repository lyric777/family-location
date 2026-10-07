import Constants from 'expo-constants';
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

  getMembers(familyId: string) {
    return this.request<RelayFamily>('/v1/families/' + encodeURIComponent(familyId) + '/members');
  }
}

export function getConfiguredRelay() {
  const configured = Constants.expoConfig?.extra?.relayUrl;
  const url = typeof configured === 'string' ? configured.replace(/\/$/, '') : '';
  return url ? new HttpFamilyRelay(url) : null;
}
