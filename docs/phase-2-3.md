# Phase 2.3 - Location sync implementation plan

## Existing constraints
Phase 2.2 relay has no authentication. Public keys are placeholders. Family and device state are in JS memory and the relay is also in memory. Do not publish location data to the existing unauthenticated LAN API.

## Implementation sequence
1. Durable installation identity using Android-backed secure storage, and persisted family membership. Identity survives JS reload and ordinary process death. Explicit logout/reset removes membership without silently regenerating device identity.
2. Device possession proof and family authorization. Invites expire and are one-time or limited-use. Members can be revoked. All membership and location endpoints check authenticated membership.
3. End-to-end location encryption: generate a family content key, provision it only to authorized devices, encrypt payloads with authenticated encryption, and include version, sender, family, timestamp, message ID, and nonce in the authenticated context. Reject replayed/expired messages.
4. Relay stores only the latest opaque encrypted envelope per device and a server receive timestamp, never plaintext coordinates.
5. Native Android location service uploads without depending on a mounted React screen, with bounded retry/backoff and clear user-controlled stop behavior. Do not upload if sharing is disabled.
6. React Native screen decrypts and displays peer location, age, and errors; refresh on foreground and periodically while visible.

## Acceptance
- Same deviceId and family membership after app restart.
- OPPO and emulator exchange two different coordinates, with freshness timestamps.
- Background updates continue with React UI closed but foreground location service alive.
- No upload after explicit stop or recent-task swipe.
- Unauthorized device cannot fetch or overwrite family location.
- Relay storage and logs never contain plaintext coordinates.
- Network interruption recovers without duplicate or stale-location overwrite.

## Local-only limitation
The Phase 2.2 relay is for LAN testing only. It has no secure identity or encryption yet. It must not be exposed publicly or used for real family location sharing.
