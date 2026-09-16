export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';

export type LocationMessage = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestampMs: number;
};

/**
 * Business code talks to this interface rather than WebRTC directly.
 * Phase 4 will provide the first real implementation.
 */
export interface FamilyTransport {
  readonly connectionState: ConnectionState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendLocation(location: LocationMessage): Promise<void>;
}
