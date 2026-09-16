# Family Location

Privacy-first family location sharing and communication for Android, built with React Native and native Android capabilities.

## Goals

- No traditional account/password required
- Device-to-device family pairing
- Long-running Android location sharing via a foreground service
- Adaptive location sampling for battery efficiency
- Local-first location history
- Family walkie-talkie / push-to-talk over end-to-end encrypted audio
- Emergency family calling with clear microphone/call indicators
- P2P-first transport with relay fallback
- End-to-end encrypted family data
- OTA updates for JavaScript/assets through `expo-updates` (xprem-compatible)

## Architecture direction

React Native owns the product UI and application-level orchestration. Reliability-critical Android behavior lives in native Android code behind a small RN bridge/module boundary.

```text
React Native
  |-- map / family UI
  |-- pairing / settings
  |-- history
  |-- walkie-talkie / call UI
  `-- transport orchestration

Android native
  |-- foreground location service
  |-- fused location provider
  |-- Android Keystore device identity
  |-- boot/network recovery
  `-- notification + permissions

Transport
  |-- signaling / rendezvous (lightweight backend)
  |-- WebRTC data channel (P2P-first)
  |-- WebRTC audio
  `-- TURN relay fallback
```

## OTA policy

This app is designed to use `expo-updates`, so xprem can be used as the OTA server because it implements the Expo Updates protocol.

OTA is for compatible JavaScript and asset changes. Changes to native Android code, native dependencies, permissions, foreground-service declarations, or the JS/native contract require a new binary/runtime version rather than an OTA-only release.

## Development phases

### Phase 0 - Bootstrap

- React Native + Expo modules / development build
- Android-first project
- `expo-updates` integration boundary
- Basic lint/typecheck/project structure

### Phase 1 - Background location reliability

- Location permissions
- Android foreground location service
- Fused Location Provider
- Adaptive sampling modes: idle / moving / live-view
- Local diagnostics and battery tests
- Reboot and network-change recovery

No map and no P2P yet. The goal is to prove that location collection is reliable enough on real devices.

### Phase 2 - Local history + map

- Local database
- Location history retention
- Current-location map
- Track rendering
- Diagnostics screen

### Phase 3 - Device identity + family pairing

- Device keypair in Android Keystore
- Device ID derived from public identity
- QR / invitation pairing
- Family membership
- Device revoke / replacement flow

No email, phone number, or password is required for the user-facing identity model.

### Phase 4 - P2P transport

- Signaling/rendezvous backend
- WebRTC ICE
- STUN
- DataChannel
- Heartbeat + reconnect
- Wi-Fi/mobile-network switching tests
- Transport abstraction so WebRTC can be replaced or supplemented later

### Phase 5 - Production reliability

- TURN fallback
- Encrypted offline catch-up/synchronization
- Connection health UI
- OEM battery-optimization guidance
- Failure telemetry without collecting location content

### Phase 6 - Family walkie-talkie and calling

- Push-to-talk / walkie-talkie as a core family communication mode
- Explicit family call / intercom UX
- WebRTC audio
- Emergency family calling
- Android microphone foreground-service handling
- Clear in-use microphone/call indicators

The app will not implement covert microphone activation or hidden listening.

### Phase 7 - Small-scale release

- Privacy policy and consent UX
- Abuse prevention / revoke controls
- OTA production + preview channels
- Release signing
- Crash/reliability monitoring
- Store/distribution preparation

## Status

Architecture/bootstrap phase.
