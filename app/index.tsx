import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import FamilyLocation, { type LocationMode, type NativeLocationSnapshot } from '../modules/family-location';

const MODES: LocationMode[] = ['IDLE', 'MOVING', 'LIVE'];

const EMPTY_SNAPSHOT: NativeLocationSnapshot = {
  running: false,
  mode: 'MOVING',
  latitude: null,
  longitude: null,
  accuracyMeters: null,
  timestampMs: null,
};

export default function HomeScreen() {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (Platform.OS === 'android') setSnapshot(FamilyLocation.getSnapshot());
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const startSharing = async () => {
    if (Platform.OS !== 'android') return;
    setBusy(true);
    try {
      const location = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      if (location !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Location permission required');
        return;
      }
      if (Platform.Version >= 33) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      await FamilyLocation.start();
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const stopSharing = async () => {
    setBusy(true);
    try {
      await FamilyLocation.stop();
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const setMode = async (mode: LocationMode) => {
    await FamilyLocation.setMode(mode);
    refresh();
  };

  const lastUpdated = snapshot.timestampMs
    ? new Date(snapshot.timestampMs).toLocaleTimeString()
    : 'Waiting for first location…';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>PHASE 1 · POWER MODES</Text>
        <Text style={styles.title}>Family Location</Text>
        <Text style={styles.subtitle}>
          Switch native location strategies without stopping the foreground service.
        </Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>Foreground service</Text>
            <Text style={snapshot.running ? styles.running : styles.stopped}>
              {snapshot.running ? 'RUNNING' : 'STOPPED'}
            </Text>
          </View>

          <Text style={styles.label}>Location mode</Text>
          <View style={styles.modeRow}>
            {MODES.map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setMode(mode)}
                style={[styles.modeButton, snapshot.mode === mode && styles.modeButtonActive]}>
                <Text style={[styles.modeText, snapshot.mode === mode && styles.modeTextActive]}>
                  {mode}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.hint}>
            IDLE · 5 min / 100 m   MOVING · 30 s / 20 m   LIVE · 5 s / 0 m
          </Text>

          <Text style={styles.label}>Last location</Text>
          <Text style={styles.value}>
            {snapshot.latitude == null || snapshot.longitude == null
              ? '—'
              : `${snapshot.latitude.toFixed(6)}, ${snapshot.longitude.toFixed(6)}`}
          </Text>
          <Text style={styles.meta}>
            {snapshot.accuracyMeters == null
              ? lastUpdated
              : `±${snapshot.accuracyMeters.toFixed(0)} m · ${lastUpdated}`}
          </Text>

          <Pressable
            disabled={busy}
            onPress={snapshot.running ? stopSharing : startSharing}
            style={[styles.button, snapshot.running ? styles.stopButton : styles.startButton]}>
            <Text style={styles.buttonText}>
              {busy ? 'Working…' : snapshot.running ? 'Stop location sharing' : 'Start location sharing'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.note}>
          These modes are manually selectable for validation. Automatic movement detection comes next.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f2' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 16 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5, opacity: 0.5 },
  title: { fontSize: 38, fontWeight: '700', letterSpacing: -1 },
  subtitle: { fontSize: 17, lineHeight: 25, opacity: 0.65 },
  card: { marginTop: 12, padding: 20, borderRadius: 18, backgroundColor: '#fff', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  running: { fontSize: 12, fontWeight: '800' },
  stopped: { fontSize: 12, fontWeight: '800', opacity: 0.4 },
  label: { marginTop: 8, fontSize: 12, fontWeight: '700', opacity: 0.45, textTransform: 'uppercase' },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#eeeeea' },
  modeButtonActive: { backgroundColor: '#171717' },
  modeText: { fontSize: 12, fontWeight: '800' },
  modeTextActive: { color: '#fff' },
  hint: { fontSize: 11, lineHeight: 16, opacity: 0.45 },
  value: { fontSize: 21, fontWeight: '600', fontVariant: ['tabular-nums'] },
  meta: { fontSize: 14, opacity: 0.55 },
  button: { marginTop: 10, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  startButton: { backgroundColor: '#171717' },
  stopButton: { backgroundColor: '#4b1f1f' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 19, opacity: 0.5 },
});
