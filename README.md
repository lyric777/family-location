# Family Location

Privacy-first Android family location sharing, built with React Native (Expo) and native Android services.

> **Development status (2026-10-24):** Phase 2.2 family pairing passed an OPPO phone + Android emulator acceptance test. Phase 2.3 secure pairing, key management, and location synchronization is **in development and not yet accepted**. Do not use the current LAN relay to share real family locations or expose it to the public internet.

## Product goals

- No traditional account, phone number, or password required for device-based family identity.
- Explicit, consent-based family location sharing with clear start/stop controls.
- Reliable native Android foreground location service, including locked-screen operation, with battery-aware IDLE / MOVING / LIVE modes.
- End-to-end encrypted family location data: the relay must not receive plaintext coordinates or raw family content keys.
- Simple in-person family pairing using a short invitation code (QR-based entry is planned).
- Future: local history and map, P2P-first transport with relay fallback, family push-to-talk/calling, and OTA updates.

## Architecture

```text
React Native / Expo
  |-- family pairing and member-management UI
  |-- diagnostics and sharing controls
  |-- key-provisioning orchestration (current prototype)
  `-- future map and history UI

Native Android (Expo module)
  |-- foreground location service and adaptive sampling
  |-- location/sensor diagnostics
  |-- Android Keystore signing and ECDH identities
  `-- AES-GCM family key management

Development LAN relay (Node.js)
  |-- family creation and invitation redemption
  |-- challenge/signature authentication and membership checks
  |-- encrypted family key package forwarding
  `-- latest opaque location envelopes (not yet integrated end to end)
```

The current Node.js relay is an in-memory **development prototype**, not a persistent production backend. The planned WebRTC/P2P transport and TURN fallback are **not implemented**.

Core Android location and cryptographic functions should not depend on Google Mobile Services (GMS). See the phase documentation for actual device-test status.

## Current milestones

| Milestone | Status | Notes |
| --- | --- | --- |
| Phase 0 - Bootstrap | Implemented | Expo, React Native, native module, development build |
| Phase 1 - Native location reliability | Implemented and iteratively tested | OPPO foreground service, motion/IDLE/MOVING behavior and recent-app swipe handling; see Phase 1 notes |
| Phase 2.0 - Family sharing foundation | Code implemented | Phase-specific details tracked in project history |
| Phase 2.1 - LAN relay / pairing foundation | Code implemented | Earlier iterations tested |
| Phase 2.2 - Two-device family pairing | **Accepted** | OPPO created a family; emulator joined; both reported two members |
| Phase 2.3.1 - Persistent device identity | Code committed, validation pending | Keystore identity and local membership persistence |
| Phase 2.3.2 - Secure pairing and key lifecycle | **In progress** | Signed requests, ECDH, AES-GCM, owner/member actions, epoch rotation; no end-to-end acceptance yet |
| Phase 2.3.3 - Encrypted background location sync | Planned | Native upload, peer decryption/display, background rotated-key receipt |
| Later - Map/history, P2P, communication and release hardening | Planned | Not implemented |

**Important:** The Phase 2.2 acceptance applies to the older pairing protocol, not automatically to the current `main` branch. Code committed does not mean tested or released.

## Family membership rules

- **Owner:** creates a family, invites members, removes other members, and may dissolve the family.
- **Member:** joins by invitation and can voluntarily leave; cannot remove others or dissolve the family.
- **Initial pairing:** both devices are in the foreground; joining should finish automatically only when **both devices have confirmed** the same usable family key. A manual key-sync button is for development only.
- **Membership change:** the relay revokes access immediately and pauses new publication until the owner rotates the family key and distributes it to remaining members. Owner rotation can wait until the owner next opens the app.
- **Remaining members:** the intended Phase 2.3.3 behavior is to retrieve already-distributed rotated keys via a running native foreground service, without opening the React UI. This is **not yet implemented**.
- **Daily sharing:** encrypted background location updates must work with the screen locked, independently of React UI. Explicit user stop and recent-app swipe follow the established sharing-stop behavior.

## Local development

Prerequisites: Node.js 20+, Android SDK / emulator or physical Android device, and the Expo/Gradle build toolchain.

```bash
npm install
npm run typecheck
npm run lint
npm run relay:dev
```

Configure the development relay URL through the project's `EXPO_PUBLIC_RELAY_URL` environment setting. Physical devices must be able to reach the host on the same LAN; `localhost` inside an emulator/phone is not the host computer.

To build an Android development client:

```bash
npx expo run:android
```

Windows release-preview build (requires generated Android project and toolchain):

```powershell
npm run android:preview
```

Native Kotlin, manifest, permissions, or native bridge changes require a rebuilt APK. JavaScript-only changes may be reloaded through the development client or delivered via a compatible OTA runtime. `expo-updates` is present; an xprem-compatible OTA deployment remains a separate configuration/release task.

## Documentation

- [Phase 1 - background location reliability](docs/phase-1.md) - initial milestone and historical test procedure; some implementation details are outdated.
- [Phase 2.3 - secure family synchronization](docs/phase-2-3.md) - **current authoritative requirements, implementation status, open risks, and acceptance gate**.

## Next acceptance gate

1. Finish the two-device Ready handshake and remove the need for manual key synchronization.
2. Run TypeScript/lint, Kotlin/Gradle build, and relay protocol/security tests.
3. Test OPPO + emulator: pairing, restart persistence, shared-key proof, member leave/revoke, owner dissolution, key rotation, and unauthorized request rejection.
4. Implement and verify native encrypted background location sync in Phase 2.3.3.

Do not treat current `main` as production-ready or use it to publish real location data until the above tests and privacy requirements pass.
