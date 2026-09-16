export type LocationMode = 'idle' | 'moving' | 'live';

export type LocationSample = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestampMs: number;
  mode: LocationMode;
};
