# Phase 2.3 - Secure family location synchronization

Updated: 2026-10-24. This document is the current Phase 2.3 handoff and acceptance specification. Implementation claims below are based on repository inspection and prior acceptance reports, not a fresh Android build.

## Confirmed product decisions

- Android-first, React Native UI and native Android foreground location service; no GMS dependency for core location or cryptography.
- Device identity: Android Keystore P-256 signing key; stable device ID derived from SHA-256 of public DER key. A separate P-256 ECDH key handles family key wrapping.
- Owner creates a family and invites members by short code / eventual QR. Member joins in person with both apps in the foreground. Pairing is only complete after **both devices** confirm usable matching family keys. No manual "Sync family key" action in final UX.
- Owner can revoke members or dissolve the family. Members can leave voluntarily, but cannot revoke other members or dissolve the family.
- Revocation or departure immediately removes Relay authorization, clears old location snapshots, and pauses publication until key rotation completes. Owner performs rotation upon opening the app; no background owner key distribution is required.
- Remaining members should obtain already-distributed new keys automatically through their **running native foreground service**, without opening the React UI. This is planned for Phase 2.3.3 and **not implemented**.
- Ordinary location collection, encryption, upload, and background operation must work while the screen is locked and React UI is absent. Explicit stop / recent-app swipe should stop sharing as agreed during Phase 1 testing.
- Relay must not see plaintext coordinates or raw family content keys. The LAN HTTP relay is development-only and must not be exposed to the public internet.

## Phase 2.2 acceptance (user reported PASS)

OPPO physical Android phone created a family, emulator joined via the LAN relay, and both displayed two members. Six-character invitation generation and development HTTP cleartext access were fixed. This acceptance predates the new Phase 2.3 authentication protocol; it does **not** validate the current main branch.

## Phase 2.3 implementation status

| Workstream | Current state |
| --- | --- |
| 2.3.1 Keystore device identity and family membership persistence | Code committed; Android validation pending |
| Signed challenge authentication, public key identity checks, signed request method/path/body | Code committed; protocol tests pending |
| AES-GCM family content key and Keystore wrapping | Code committed; Android validation pending |
| ECDH exchange public key binding and encrypted key packages | Code committed; end-to-end tests pending |
| Family key epochs, revocation, owner rotation, leave/dissolve | Code committed; integration tests pending |
| Auto provisioning after create/join/restore | Code committed; integration tests pending |
| Active-screen retry every 15 seconds | Code committed; not background execution |
| Owner Remove, Member Leave, Owner Dissolve UI | Code committed; Android validation pending |
| Both-sides Ready handshake / confirmation | Not implemented |
| Native background receipt of rotated keys | Not implemented; Phase 2.3.3 |
| Native background encrypted location upload and peer display | Not implemented; Phase 2.3.3 |
| TypeScript / Kotlin build and security test suite | Not yet completed |

## Outstanding engineering concerns

1. Relay uses volatile in-memory maps: restarting it loses family and key state. Production persistence and recovery are not implemented.
2. Ensure owner authorization, device identity binding, invite redemption, and membership mutations cannot be spoofed or raced. New membership and invitation flows need adversarial tests.
3. Key epoch writes and key replacement must be crash-safe; old epochs must not be re-imported. Ensure revocation cannot be bypassed with stale packages.
4. Pairing should remain pending until both endpoints prove possession of the same family key. Owner should automatically notice newly joined members while in foreground.
5. The current React screen exposes manual "Sync family key" for debugging; remove from final user UX.
6. Compile and test native P-256 ECDH with Android Keystore on the OPPO and emulator; check API support and device differences.
7. Use transport authentication and content encryption together; verify relay does not log plaintext positions.
8. Keep release acceptance separate from code-complete claims.

## Next steps and acceptance gate

1. Implement both-sides Ready confirmation, fix pending pairing states, and harden key-rotation recovery.
2. Run TypeScript checks, Kotlin/Gradle compilation, and relay protocol tests.
3. Verify OPPO + emulator: initial pairing, restart identity persistence, same-key proof, leave/revoke/dissolve, epoch rotation, unauthorized access denial.
4. Phase 2.3.3: native encrypted background location upload, peer-location read/decrypt, and native receipt of rotated keys.
5. Do not mark Phase 2.3 PASS until background location sharing and all safety checks pass.
