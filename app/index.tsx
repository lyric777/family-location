import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import FamilyLocation, { type LocationMode, type NativeLocationSnapshot } from '../modules/family-location';
import { applyCreatedFamily, applyJoinedFamily, beginVerifiedRemoval, completeVerifiedRemoval, clearPersistedFamily, getOrCreateLocalFamilyState, initializeFamilyState, persistFamilyState, updateMembers, type LocalFamilyState } from '../src/core/family/localFamilyStore';
import { getConfiguredRelay, RelayHttpError } from '../src/core/transport/HttpFamilyRelay';
import { provisionFamilyKey } from '../src/core/family/keyProvisioning';
import { ownerRevocationMessage, verifyOwnerRevocation, type OwnerRevocationStatement } from '../src/core/family/ownerRevocation';

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
  const [pairingStep, setPairingStep] = useState('');
  const [pairingError, setPairingError] = useState('');
  const [identityReady, setIdentityReady] = useState(false);
  const [keyStatus, setKeyStatus] = useState('Not checked');
  const [revocationDiagnostic, setRevocationDiagnostic] = useState('');
  const [familyUnavailable, setFamilyUnavailable] = useState(false);
  const relay = getConfiguredRelay();
  const familyRef = useRef(family);
  const syncInFlight = useRef(false);
  const revokedFamilyRef = useRef<string | null>(null);
  familyRef.current = family;

  const verifyRevocationError = async (error: unknown, current: LocalFamilyState) => {
    if (!(error instanceof RelayHttpError) || error.code !== 'MEMBERSHIP_REVOKED') return false;
    const evidence = error.revocation;
    const localKey = !!current.ownerPublicKey && !!current.ownerDeviceId;
    const localEpoch = current.familyId ? await FamilyLocation.getFamilyKeyEpoch(current.familyId) : -1;
    const statement = evidence?.statement;
    const remoteEpoch = statement?.keyEpoch;
    const prefix = `Evidence: ${evidence ? 'present' : 'missing'} | Owner key: ${localKey ? 'present' : 'missing'} | Epoch: ${localEpoch} -> ${Number.isSafeInteger(remoteEpoch) ? remoteEpoch : 'invalid'}`;
    const fail = (reason: string) => {
      setRevocationDiagnostic(`${prefix} | Check: ${reason}`);
      return false;
    };
    if (!evidence || !current.familyId || !localKey) return fail('missing evidence or owner identity');
    if (statement.version !== 1 || statement.action !== 'revoke') return fail('statement format');
    if (statement.familyId !== current.familyId ||
        statement.ownerDeviceId !== current.ownerDeviceId ||
        statement.memberDeviceId !== current.device.deviceId) return fail('family / device binding');
    if (!Number.isSafeInteger(remoteEpoch) || remoteEpoch <= localEpoch) return fail('epoch not newer');
    const ownerFingerprint = await FamilyLocation.sha256HexBase64(current.ownerPublicKey!);
    if ('dev_' + ownerFingerprint !== current.ownerDeviceId) return fail('owner key fingerprint');
    const verified = await verifyOwnerRevocation(statement, evidence.signature, {
      familyId: current.familyId,
      ownerDeviceId: current.ownerDeviceId!,
      ownerPublicKey: current.ownerPublicKey!,
      memberDeviceId: current.device.deviceId,
      minimumEpoch: localEpoch,
    });
    setRevocationDiagnostic(`${prefix} | Check: ${verified ? 'signature valid' : 'signature invalid'}`);
    return verified;
  };

  const markMissingFamily = (error: unknown, familyId: string) => {
    if (!(error instanceof RelayHttpError) || error.code !== 'FAMILY_NOT_FOUND' ||
        familyRef.current.familyId !== familyId) return false;
    setFamilyUnavailable(true);
    setKeyStatus('Family unavailable on relay');
    return true;
  };

  const cleanupInFlight = useRef(false);
  const handleVerifiedRemoval = async (error: unknown, current: LocalFamilyState) => {
    if (!current.familyId || cleanupInFlight.current) return false;
    let verified = false;
    try { verified = await verifyRevocationError(error, current); }
    catch { setRevocationDiagnostic('Revocation verification threw an error (no secrets logged)'); return false; }
    if (!verified) return false;
    if (familyRef.current.familyId !== current.familyId) return true;
    cleanupInFlight.current = true;
    revokedFamilyRef.current = current.familyId;
    setKeyStatus('Removing local family access');
    try {
      await beginVerifiedRemoval(current.familyId);
      const cleared = await completeVerifiedRemoval(current.familyId);
      familyRef.current = cleared;
      setFamily(cleared);
      setKeyStatus('Not checked');
      setRevocationDiagnostic('');
      setPairingStep('');
      setPairingError('');
      Alert.alert('Removed from family', 'The family owner removed this device.');
    } catch (cleanupError) {
      setKeyStatus('Removal verified - cleanup failed');
      console.warn('[Family] verified removal cleanup failed', cleanupError);
    } finally {
      cleanupInFlight.current = false;
    }
    return true;
  };

  const syncFamilyKey = async (familyId: string, owner: boolean) => {
    if (!relay) return;
    if (revokedFamilyRef.current === familyId || cleanupInFlight.current) return;
    setKeyStatus('Synchronizing');
    try {
      const ready = await provisionFamilyKey(relay, familyId, owner);
      if (familyRef.current.familyId === familyId && revokedFamilyRef.current !== familyId) setKeyStatus(ready ? 'Ready' : owner ? 'Waiting for members' : 'Waiting for owner');
    } catch (error) {
      const current = familyRef.current;
      if (current.familyId !== familyId) return;
      if (error instanceof RelayHttpError && error.code === 'MEMBERSHIP_REVOKED') {
        if (await handleVerifiedRemoval(error, current)) return;
        revokedFamilyRef.current = familyId;
        setKeyStatus('Access revoked - verification required');
      } else if (markMissingFamily(error, familyId)) {
        return;
      } else if (revokedFamilyRef.current !== familyId && !cleanupInFlight.current) {
        setKeyStatus('Failed');
        Alert.alert('Family key sync failed', error instanceof Error ? error.message : String(error));
      }
    }
  };

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
    initializeFamilyState().then(async (loaded) => {
      if (!mounted) return;
      // Recovery must finish before a resume intent can restart location sharing.
      await initialize();
      if (!mounted) return;
      setFamily(loaded);
      setIdentityReady(true);
      if (loaded.familyId && relay) {
        setKeyStatus('Synchronizing');
        provisionFamilyKey(relay, loaded.familyId, loaded.role === 'owner')
          .then((ready) => {
            if (mounted && familyRef.current.familyId === loaded.familyId &&
                revokedFamilyRef.current !== loaded.familyId) {
              setKeyStatus(ready ? 'Ready' : loaded.role === 'owner' ? 'Waiting for members' : 'Waiting for owner');
            }
          })
          .catch(async (error) => {
            if (!mounted || familyRef.current.familyId !== loaded.familyId) return;
            if (error instanceof RelayHttpError && error.code === 'MEMBERSHIP_REVOKED') {
              if (await handleVerifiedRemoval(error, loaded)) return;
              revokedFamilyRef.current = loaded.familyId;
              setKeyStatus('Access revoked - verification required');
            } else if (!markMissingFamily(error, loaded.familyId!)) setKeyStatus('Retry required');
          });
      }
    }).catch((error) => Alert.alert('Device identity error', String(error)));
    const timer = setInterval(refresh, 2_000);
    // While the UI is active, automatically deliver keys to newly joined members
    // and recover after revocation/rotation. Never run overlapping exchanges.
    const keyTimer = setInterval(async () => {
      const current = familyRef.current;
      if (AppState.currentState !== 'active' || !relay || !current.familyId || syncInFlight.current || revokedFamilyRef.current === current.familyId) return;
      syncInFlight.current = true;
      try {
        const ready = await provisionFamilyKey(relay, current.familyId, current.role === 'owner');
        if (mounted && familyRef.current.familyId === current.familyId &&
            revokedFamilyRef.current !== current.familyId && !cleanupInFlight.current) {
          setKeyStatus(ready ? 'Ready' : current.role === 'owner' ? 'Waiting for members' : 'Connecting');
        }
      } catch (error) {
        if (mounted && familyRef.current.familyId === current.familyId) {
          if (error instanceof RelayHttpError && error.code === 'MEMBERSHIP_REVOKED') {
            if (await handleVerifiedRemoval(error, current)) return;
            if (mounted && familyRef.current.familyId === current.familyId) {
              revokedFamilyRef.current = current.familyId;
              setKeyStatus('Access revoked - verification required');
            }
          } else if (!markMissingFamily(error, current.familyId) && revokedFamilyRef.current !== current.familyId && !cleanupInFlight.current) setKeyStatus('Retrying');
        }
      } finally {
        syncInFlight.current = false;
      }
    }, 15_000);
    return () => {
      mounted = false;
      clearInterval(timer);
      clearInterval(keyTimer);
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic">
        <Text style={styles.eyebrow}>PHASE 1 · POWER MODES</Text>
        <Text style={styles.title}>Family Location</Text>
        <Text style={styles.subtitle}>
          Background location plus LAN relay family pairing.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Family pairing · 2.3</Text>
          <Text style={styles.hint}>Relay: {relay ? 'CONFIGURED' : 'NOT CONFIGURED'}</Text>
          {pairingStep ? <Text style={styles.meta}>Pairing step: {pairingStep}</Text> : null}
          {pairingError ? <Text selectable style={styles.hint}>Pairing error: {pairingError}</Text> : null}
          <Text style={styles.meta}>Device: {family.device.displayName}</Text>
          <Text style={styles.hint}>{family.device.deviceId}</Text>
          {family.familyId ? (
            <>
              <Text style={styles.meta}>Role: {family.role?.toUpperCase()} · Family: {family.familyId}</Text>
              {family.inviteCode ? <Text style={styles.inviteCode}>{family.inviteCode}</Text> : null}
              <Text style={styles.hint}>
                {family.role === 'owner' ? 'Share this code with the second device.' : 'Joined through the LAN relay.'}
              </Text>
              <Text style={styles.meta}>Family key: {keyStatus}</Text>
              {familyUnavailable ? (
                <View style={styles.warning}>
                  <Text style={styles.warningTitle}>Family unavailable on relay</Text>
                  <Text style={styles.warningText}>The development relay no longer recognizes this family. You can reset this device without affecting other devices.</Text>
                  <Pressable style={styles.secondaryButton} disabled={pairingBusy} onPress={() => {
                    Alert.alert('Reset local family?', 'This deletes the local family key and membership on this device only.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Reset this device', style: 'destructive', onPress: async () => {
                        setPairingBusy(true);
                        try {
                          const id = familyRef.current.familyId;
                          if (!id) return;
                          await FamilyLocation.stop();
                          await FamilyLocation.deleteFamilyKey(id);
                          const cleared = await clearPersistedFamily();
                          familyRef.current = cleared;
                          setFamily(cleared);
                          setFamilyUnavailable(false);
                          setKeyStatus('Not checked');
                          setRevocationDiagnostic('');
                        } catch (error) {
                          Alert.alert('Local reset failed', error instanceof Error ? error.message : String(error));
                        } finally { setPairingBusy(false); }
                      } },
                    ]);
                  }}>
                    <Text style={styles.secondaryButtonText}>Reset local family</Text>
                  </Pressable>
                </View>
              ) : null}

              {revocationDiagnostic ? <Text selectable style={styles.error}>Revocation diagnostic: {revocationDiagnostic}</Text> : null}
              <Pressable style={styles.secondaryButton} onPress={() => syncFamilyKey(family.familyId!, family.role === 'owner')}>
                <Text style={styles.secondaryButtonText}>Sync family key</Text>
              </Pressable>
              <Text style={styles.meta}>Members: {family.memberDeviceIds.length}</Text>
              {family.memberDeviceIds.map((id) => (
                <View key={id} style={styles.memberRow}>
                  <Text style={styles.memberId}>{id}{id === family.device.deviceId ? ' (this phone)' : ''}</Text>
                  {family.role === 'owner' && id !== family.device.deviceId ? (
                    <Pressable disabled={pairingBusy} onPress={() => {
                      if (!relay || !family.familyId) return;
                      const familyId = family.familyId;
                      Alert.alert('Remove member?', 'This device will lose access to the family.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: async () => {
                          setPairingBusy(true);
                          try {
                            const exchange = await relay.getKeyExchange(familyId);
                            const statement: OwnerRevocationStatement = {
                              version: 1, action: 'revoke', familyId,
                              ownerDeviceId: family.device.deviceId,
                              memberDeviceId: id, keyEpoch: exchange.keyEpoch + 1,
                            };
                            const signature = await FamilyLocation.signIdentityChallenge(ownerRevocationMessage(statement));
                            await relay.revokeMember(familyId, id, statement, signature);
                            const members = await relay.getMembers(familyId);
                            setFamily(updateMembers(members.members.map((m) => m.deviceId)));
                            await persistFamilyState();
                            await syncFamilyKey(familyId, true);
                          } catch (error) {
                            Alert.alert('Cannot remove member', error instanceof Error ? error.message : String(error));
                          } finally {
                            setPairingBusy(false);
                          }
                        } },
                      ]);
                    }} style={styles.removeMemberButton}>
                      <Text style={styles.secondaryButtonText}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
              <Pressable
                style={styles.secondaryButton}
                onPress={async () => {
                  if (!relay || !family.familyId) return;
                  try {
                    const result = await relay.getMembers(family.familyId);
                    setFamily(updateMembers(result.members.map((member) => member.deviceId)));
                    await persistFamilyState();
                  } catch (error) {
                    Alert.alert('Cannot refresh family', error instanceof Error ? error.message : 'Relay error');
                  }
                }}>
                <Text style={styles.secondaryButtonText}>Refresh members</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} disabled={pairingBusy} onPress={() => {
                const familyId = family.familyId;
                if (!familyId || !relay) return;
                const isOwner = family.role === 'owner';
                Alert.alert(
                  isOwner ? 'Dissolve family?' : 'Leave family?',
                  isOwner ? 'This ends the family for all members.' : 'You will lose access to this family.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: isOwner ? 'Dissolve' : 'Leave', style: 'destructive', onPress: async () => {
                      setPairingBusy(true);
                      try {
                        if (isOwner) await relay.dissolveFamily(familyId);
                        else await relay.leaveFamily(familyId);
                        await FamilyLocation.stop();
                        await FamilyLocation.deleteFamilyKey(familyId);
                        setFamily(await clearPersistedFamily());
                        setKeyStatus('Not checked');
                      } catch (error) {
                        Alert.alert('Cannot update family', error instanceof Error ? error.message : String(error));
                      } finally {
                        setPairingBusy(false);
                      }
                    } },
                  ],
                );
              }}>
                <Text style={styles.secondaryButtonText}>{family.role === 'owner' ? 'Dissolve family' : 'Leave family'}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                disabled={pairingBusy || !relay || !identityReady}
                style={[styles.button, styles.createFamilyButton]}
                onPress={async () => {
                  if (!relay) return;
                  setPairingBusy(true);
                  setPairingError('');
                  setPairingStep('Connecting to relay');
                  try {
                    const result = await relay.createFamily({ ownerDeviceId: family.device.deviceId, ownerPublicKey: (await FamilyLocation.getDeviceIdentity()).publicKey });
                    setPairingStep('Saving family');
                    setFamily(applyCreatedFamily(result.familyId, result.inviteCode, result.members.map((member) => member.deviceId)));
                    await persistFamilyState();
                    setPairingStep('Initializing key');
                    await syncFamilyKey(result.familyId, true);
                    setPairingStep('');
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    setPairingError(message);
                    setPairingStep('Failed');
                    Alert.alert('Cannot create family', message);
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
                    const result = await relay.joinFamily({ inviteCode: inviteInput.trim().toUpperCase(), deviceId: family.device.deviceId, devicePublicKey: (await FamilyLocation.getDeviceIdentity()).publicKey });
                    setFamily(applyJoinedFamily(result.familyId, inviteInput, result.members.map((member) => member.deviceId)));
                    await persistFamilyState();
                    await syncFamilyKey(result.familyId, false);
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
      </ScrollView>
    </SafeAreaView>
  );
}


function formatTime(value: number | null) {
  return value ? new Date(value).toLocaleTimeString() : '—';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f2' },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 32, gap: 16 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5, opacity: 0.5 },
  title: { fontSize: 38, fontWeight: '700', letterSpacing: -1 },
  subtitle: { fontSize: 17, lineHeight: 25, opacity: 0.65 },
  card: { marginTop: 12, padding: 20, borderRadius: 18, backgroundColor: '#fff', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  memberId: { flex: 1, flexShrink: 1, minWidth: 0, fontSize: 11, lineHeight: 16, opacity: 0.45 },
  removeMemberButton: { flexShrink: 0, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#eeeeea' },
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
  createFamilyButton: { backgroundColor: '#171717' },
  stopButton: { backgroundColor: '#4b1f1f' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 19, opacity: 0.5 },
  inviteCode: { fontSize: 30, fontWeight: '800', letterSpacing: 6, textAlign: 'center', paddingVertical: 8 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#d8d8d2', borderRadius: 12, paddingHorizontal: 14, fontSize: 16, letterSpacing: 2 },
  secondaryButton: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eeeeea' },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  or: { textAlign: 'center', fontSize: 11, fontWeight: '700', opacity: 0.35 },
});
