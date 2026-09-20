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

import FamilyLocation, {
  type NativeLocationSnapshot,
} from '../modules/family-location';

const EMPTY_SNAPSHOT: NativeLocationSnapshot = {
  running: false,
  latitude: null,
  longitude: null,
  accuracyMeters: null,
  timestampMs: null,
};

export default function HomeScreen() {
  const [snapshot, setSnapshot] = useState<NativeLocationSnapshot>(EMPTY_SNAPSHOT);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (Platform.OS !== 'android') return;
    setSnapshot(FamilyLocation.getSnapshot());
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const startSharing = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Android only', 'Phase 1 currently targets Android.');
      return;
    }

    setBusy(true);
    try {
      const permission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Allow family location sharing',
          message:
            'Family Location needs your location while sharing is active. Phase 1 keeps this visible with a foreground-service notification.',
          buttonPositive: 'Allow',
          buttonNegative: 'Not now',
        },
      );

      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Location permission required');
        return;
      }

      await FamilyLocation.start();
      refresh();
    } catch (error) {
      Alert.alert('Could not start location sharing', String(error));
    } finally {
      setBusy(false);
    }
  };

  const stopSharing = async () => {
    setBusy(true);
    try {
      await FamilyLocation.stop();
      refresh();
    } catch (error) {
      Alert.alert('Could not stop location sharing', String(error));
    } finally {
      setBusy(false);
    }
  };

  const lastUpdated = snapshot.timestampMs
    ? new Date(snapshot.timestampMs).toLocaleTimeString()
    : 'Waiting for first location…';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>PHASE 1 · LOCATION RELIABILITY</Text>
        <Text style={styles.title}>Family Location</Text>
        <Text style={styles.subtitle}>
          First milestone: prove that Android can keep a visible location service
          alive independently of this React screen.
        </Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>Foreground service</Text>
            <Text style={snapshot.running ? styles.running : styles.stopped}>
              {snapshot.running ? 'RUNNING' : 'STOPPED'}
            </Text>
          </View>

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
            style={({ pressed }) => [
              styles.button,
              snapshot.running ? styles.stopButton : styles.startButton,
              (pressed || busy) && styles.buttonPressed,
            ]}>
            <Text style={styles.buttonText}>
              {busy
                ? 'Working…'
                : snapshot.running
                  ? 'Stop location sharing'
                  : 'Start location sharing'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.note}>
          No map, cloud sync, history, or P2P yet. Location is kept only in local
          Android storage for this reliability experiment.
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
  subtitle: { fontSize: 17, lineHeight: 25, opacity: 0.65, maxWidth: 460 },
  card: { marginTop: 12, padding: 20, borderRadius: 18, backgroundColor: '#ffffff', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  running: { fontSize: 12, fontWeight: '800' },
  stopped: { fontSize: 12, fontWeight: '800', opacity: 0.4 },
  label: { marginTop: 8, fontSize: 12, fontWeight: '700', opacity: 0.45, textTransform: 'uppercase' },
  value: { fontSize: 21, fontWeight: '600', fontVariant: ['tabular-nums'] },
  meta: { fontSize: 14, opacity: 0.55 },
  button: { marginTop: 10, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  startButton: { backgroundColor: '#171717' },
  stopButton: { backgroundColor: '#4b1f1f' },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 19, opacity: 0.5 },
});
