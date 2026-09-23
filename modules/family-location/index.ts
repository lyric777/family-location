import { requireNativeModule } from 'expo';

export type LocationMode = 'IDLE' | 'MOVING' | 'LIVE';

export type NativeLocationSnapshot = {
  running: boolean;
  mode: LocationMode;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  timestampMs: number | null;
};

type FamilyLocationNativeModule = {
  start(): Promise<void>;
  stop(): Promise<void>;
  setMode(mode: LocationMode): Promise<void>;
  getSnapshot(): NativeLocationSnapshot;
};

export default requireNativeModule<FamilyLocationNativeModule>('FamilyLocation');
