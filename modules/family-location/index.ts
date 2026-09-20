import { requireNativeModule } from 'expo';

export type NativeLocationSnapshot = {
  running: boolean;
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
