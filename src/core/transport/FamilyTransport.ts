import type { CreateFamilyRequest, CreateFamilyResponse, FamilySnapshotResponse, JoinFamilyRequest, JoinFamilyResponse, PublishLocationRequest } from '../family/protocol';
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';
export interface FamilyTransport {
  readonly connectionState: ConnectionState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  createFamily(request: CreateFamilyRequest): Promise<CreateFamilyResponse>;
  joinFamily(request: JoinFamilyRequest): Promise<JoinFamilyResponse>;
  publishLocation(request: PublishLocationRequest): Promise<void>;
  getFamilySnapshot(familyId: string, deviceId: string): Promise<FamilySnapshotResponse>;
}
