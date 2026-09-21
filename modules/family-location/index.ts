import { requireNativeModule } from 'expo';

export type NativeLocationSnapshot = {
  running: boolean;
  permissionGranted: boolean;
  requestState: string;
  lastError: string | null;
  lastCallbackAtMs: number | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  timestampMs: number | null;
};

type FamilyLocationNativeModule = {
  start(): Promise<void>;
  stop(): Promise<void>;
  getSnapshot(): NativeLocationSnapshot;
};

export default requireNativeModule<FamilyLocationNativeModule>('FamilyLocation');
