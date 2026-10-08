import { requireNativeModule } from 'expo';
export type LocationMode = 'IDLE' | 'MOVING' | 'LIVE';
export type RequestState = 'IDLE' | 'UNREGISTERING' | 'REGISTERING' | 'REGISTERED' | 'FAILED' | 'STOPPED';
export type NativeLocationSnapshot = {
  sharingEnabled: boolean; running: boolean; stopReason: string | null; mode: LocationMode; activeMode: LocationMode | null; requestState: RequestState; lastError: string | null;
  autoMode: boolean; detectedActivity: string; activityConfidence: number; activityRecognitionState: string; activityRecognitionError: string | null;
  serviceStartedAtMs: number | null; serviceStartReason: string; sensorRegisteredAtMs: number | null; lastSensorEventAtMs: number | null;
  latitude: number | null; longitude: number | null; accuracyMeters: number | null; timestampMs: number | null;
};
type FamilyLocationNativeModule = {
  getDeviceIdentity(): Promise<{ deviceId: string; publicKey: string; displayName: string }>;
  signIdentityChallenge(message: string): Promise<string>;
  getFamilyMembership(): Promise<string | null>;
  saveFamilyMembership(json: string): Promise<void>;
  clearFamilyMembership(): Promise<void>;
  start(): Promise<void>; consumeResumeSharingIntent(): Promise<boolean>; stop(): Promise<void>; setMode(mode: LocationMode): Promise<void>; setAutoMode(enabled: boolean): Promise<void>;
  getSnapshot(): NativeLocationSnapshot;
};
export default requireNativeModule<FamilyLocationNativeModule>('FamilyLocation');
