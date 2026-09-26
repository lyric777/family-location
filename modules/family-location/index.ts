import { requireNativeModule } from 'expo';
export type LocationMode = 'IDLE' | 'MOVING' | 'LIVE';
export type RequestState = 'IDLE' | 'UNREGISTERING' | 'REGISTERING' | 'REGISTERED' | 'FAILED' | 'STOPPED';
export type NativeLocationSnapshot = {
  running: boolean; mode: LocationMode; activeMode: LocationMode | null; requestState: RequestState; lastError: string | null;
  autoMode: boolean; detectedActivity: string; activityConfidence: number;
  latitude: number | null; longitude: number | null; accuracyMeters: number | null; timestampMs: number | null;
};
type FamilyLocationNativeModule = {
  start(): Promise<void>; stop(): Promise<void>; setMode(mode: LocationMode): Promise<void>; setAutoMode(enabled: boolean): Promise<void>;
  getSnapshot(): NativeLocationSnapshot;
};
export default requireNativeModule<FamilyLocationNativeModule>('FamilyLocation');
