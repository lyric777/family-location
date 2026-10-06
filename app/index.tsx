import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import FamilyLocation, { type LocationMode, type NativeLocationSnapshot } from '../modules/family-location';
import { applyCreatedFamily, applyJoinedFamily, getOrCreateLocalFamilyState, resetLocalFamily, updateMembers, type LocalFamilyState } from '../src/core/family/localFamilyStore';
import { getConfiguredRelay } from '../src/core/transport/HttpFamilyRelay';

const MODES: LocationMode[] = ['IDLE', 'MOVING', 'LIVE'];

const EMPTY_SNAPSHOT: NativeLocationSnapshot = {
  sharingEnabled: false,
  running: false,
  stopReason: null,
  mode: 'MOVING',
  activeMode: null,
  requestState: 'IDLE',
  lastError: null,
  autoMode: false,
  detectedActivity: 'UNKNOWN',
  activityConfidence: 0,
  activityRecognitionState: 'IDLE',
  activityRecognitionError: null,
  serviceStartedAtMs: null,
  serviceStartReason: 'NONE',
  sensorRegisteredAtMs: null,
  lastSensorEventAtMs: null,
  latitude: null,
  longitude: null,
  accuracyMeters: null,
  timestampMs: null,
};

export default function HomeScreen() {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [busy, setBusy] = useState(false);
  const [family, setFamily] = useState<LocalFamilyState>(() => getOrCreateLocalFamilyState());
  const [inviteInput, setInviteInput] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);
  const relay = getConfiguredRelay();

  const refresh = useCallback(() => {
    if (Platform.OS === 'android') setSnapshot(FamilyLocation.getSnapshot());
  }, []);

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      if (Platform.OS === 'android') {
        const shouldResume = await FamilyLocation.consumeResumeSharingIntent();
        if (shouldResume && mounted) {
          await startSharing();
          return;
        }
      }
      refresh();
    };
    initialize();
    const timer = setInterval(refresh, 2_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
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
    <SafeAreaView style={styles.screen} edges={['top', 'right', 'bottom', 'left']}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>PHASE 1 · POWER MODES</Text>
        <Text style={styles.title}>Family Location</Text>
        <Text style={styles.subtitle}>
          Background location plus LAN relay family pairing.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Family pairing · 2.2</Text>
          <Text style={styles.hint}>Relay: {relay ? 'CONFIGURED' : 'NOT CONFIGURED'}</Text>
          <Text style={styles.meta}>Device: {family.device.displayName}</Text>
          <Text style={styles.hint}>{family.device.deviceId}</Text>
          {family.familyId ? (
            <>
              <Text style={styles.meta}>Role: {family.role?.toUpperCase()} · Family: {family.familyId}</Text>
              {family.inviteCode ? <Text style={styles.inviteCode}>{family.inviteCode}</Text> : null}
              <Text style={styles.hint}>
                {family.role === 'owner' ? 'Share this code with the second phone. Relay validation comes in 2.2.' : 'Join recorded locally as pending. The relay will validate it in 2.2.'}
              </Text>
              <Text style={styles.meta}>Members: {family.memberDeviceIds.length}</Text>
              {family.memberDeviceIds.map((id) => <Text key={id} style={styles.hint}>• {id}{id === family.device.deviceId ? ' (this phone)' : ''}</Text>)}
              <Pressable
                style={styles.secondaryButton}
                onPress={async () => {
                  if (!relay || !family.familyId) return;
                  try {
                    const result = await relay.getMembers(family.familyId);
                    setFamily(updateMembers(result.members.map((member) => member.deviceId)));
                  } catch (error) {
                    Alert.alert('Cannot refresh family', error instanceof Error ? error.message : 'Relay error');
                  }
                }}>
                <Text style={styles.secondaryButtonText}>Refresh members</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => setFamily(resetLocalFamily())}>
                <Text style={styles.secondaryButtonText}>Reset family</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                disabled={pairingBusy || !relay}
                style={styles.button}
                onPress={async () => {
                  if (!relay) return;
                  setPairingBusy(true);
                  try {
                    const result = await relay.createFamily({ ownerDeviceId: family.device.deviceId, ownerPublicKey: 'phase-2.2-placeholder' });
                    setFamily(applyCreatedFamily(result.familyId, result.inviteCode, result.members.map((member) => member.deviceId)));
                  } catch (error) {
                    Alert.alert('Cannot create family', error instanceof Error ? error.message : 'Relay error');
                  } finally {
                    setPairingBusy(false);
                  }
                }}>
                <Text style={styles.buttonText}>{pairingBusy ? 'Working…' : 'Create family'}</Text>
              </Pressable>
              <Text style={styles.or}>OR</Text>
              <TextInput
                value={inviteInput}
                onChangeText={(value) => setInviteInput(value.toUpperCase())}
                autoCapitalize="characters"
                maxLength={6}
                placeholder="6-character invite code"
                style={styles.input}
              />
              <Pressable
                style={styles.secondaryButton}
                disabled={pairingBusy || !relay}
                onPress={async () => {
                  if (!relay) return;
                  if (inviteInput.trim().length !== 6) {
                    Alert.alert('Cannot join family', 'Invite code must be 6 characters');
                    return;
                  }
                  setPairingBusy(true);
                  try {
                    const result = await relay.joinFamily({ inviteCode: inviteInput.trim().toUpperCase(), deviceId: family.device.deviceId, devicePublicKey: 'phase-2.2-placeholder' });
                    setFamily(applyJoinedFamily(result.familyId, inviteInput, result.members.map((member) => member.deviceId)));
                  } catch (error) {
                    Alert.alert('Cannot join family', error instanceof Error ? error.message : 'Relay error');
                  } finally {
                    setPairingBusy(false);
                  }
                }}>
                <Text style={styles.secondaryButtonText}>Join family</Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.card}>
          {snapshot.stopReason === 'RECENT_SWIPE' ? (
            <View style={styles.warning}>
              <Text style={styles.warningTitle}>Location sharing stopped</Text>
              <Text style={styles.warningText}>
                Removing Family Location from Recent Apps stops background sharing on this device. Start sharing again and leave the app in Recents while sharing is active.
              </Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.cardTitle}>Foreground service</Text>
            <Text style={snapshot.running ? styles.running : styles.stopped}>
              {snapshot.running ? 'RUNNING' : 'STOPPED'}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Automatic mode</Text>
            <Pressable
              onPress={async () => {
                await FamilyLocation.setAutoMode(!snapshot.autoMode);
                refresh();
              }}
              style={[styles.autoButton, snapshot.autoMode && styles.autoButtonActive]}>
              <Text style={[styles.autoText, snapshot.autoMode && styles.modeTextActive]}>
                {snapshot.autoMode ? 'AUTO ON' : 'AUTO OFF'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.meta}>
            Motion: {snapshot.detectedActivity} · {snapshot.activityConfidence}%
          </Text>
          <Text style={styles.meta}>
            Motion sensor: {snapshot.activityRecognitionState}
          </Text>
          <Text style={styles.hint}>
            Service {formatTime(snapshot.serviceStartedAtMs)} ({snapshot.serviceStartReason}) · sensor {formatTime(snapshot.sensorRegisteredAtMs)} · event {formatTime(snapshot.lastSensorEventAtMs)}
          </Text>
          {snapshot.activityRecognitionError ? (
            <Text style={styles.error}>Motion error: {snapshot.activityRecognitionError}</Text>
          ) : null}

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
          <Text style={styles.meta}>
            Native request: {snapshot.requestState} · active {snapshot.activeMode ?? '—'}
          </Text>
          {snapshot.lastError ? <Text style={styles.error}>Native error: {snapshot.lastError}</Text> : null}

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
            onPress={snapshot.sharingEnabled && snapshot.running ? stopSharing : startSharing}
            style={[styles.button, snapshot.running ? styles.stopButton : styles.startButton]}>
            <Text style={styles.buttonText}>
              {busy ? 'Working…' : snapshot.sharingEnabled && snapshot.running ? 'Stop location sharing' : 'Start location sharing'}
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


function formatTime(value: number | null) {
  return value ? new Date(value).toLocaleTimeString() : '—';
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
  autoButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: '#eeeeea' },
  autoButtonActive: { backgroundColor: '#171717' },
  autoText: { fontSize: 11, fontWeight: '800' },
  modeButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#eeeeea' },
  modeButtonActive: { backgroundColor: '#171717' },
  modeText: { fontSize: 12, fontWeight: '800' },
  modeTextActive: { color: '#fff' },
  hint: { fontSize: 11, lineHeight: 16, opacity: 0.45 },
  value: { fontSize: 21, fontWeight: '600', fontVariant: ['tabular-nums'] },
  meta: { fontSize: 14, opacity: 0.55 },
  error: { fontSize: 12, lineHeight: 17, padding: 10, borderRadius: 8, backgroundColor: '#f5e8e8' },
  warning: { padding: 14, borderRadius: 12, backgroundColor: '#fff2d8', gap: 4 },
  warningTitle: { fontSize: 14, fontWeight: '800' },
  warningText: { fontSize: 12, lineHeight: 18, opacity: 0.7 },
  button: { marginTop: 10, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  startButton: { backgroundColor: '#171717' },
  stopButton: { backgroundColor: '#4b1f1f' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 19, opacity: 0.5 },
  inviteCode: { fontSize: 30, fontWeight: '800', letterSpacing: 6, textAlign: 'center', paddingVertical: 8 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#d8d8d2', borderRadius: 12, paddingHorizontal: 14, fontSize: 16, letterSpacing: 2 },
  secondaryButton: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eeeeea' },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  or: { textAlign: 'center', fontSize: 11, fontWeight: '700', opacity: 0.35 },
});
