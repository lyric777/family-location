# Phase 2.3 - Secure family location synchronization

Updated: 2026-10-31. This document captures Phase 2.3 requirements and the original acceptance plan. For the **latest observed device results, current blocking issue, precise next steps, and environment setup**, read [Project handoff — 2026-10-31](project-handoff-2026-10-31.md). The handoff supersedes the older status table below where they differ; no full 2.3.2 acceptance has been granted.

## Confirmed product decisions

- Android-first, React Native UI and native Android foreground location service; no GMS dependency for core location or cryptography.
- Device identity: Android Keystore P-256 signing key; stable device ID derived from SHA-256 of public DER key. A separate P-256 ECDH key handles family key wrapping.
- Owner creates a family and invites members by short code / eventual QR. Member joins in person with both apps in the foreground. Pairing is only complete after **both devices** confirm usable matching family keys. No manual "Sync family key" action in final UX.
- Owner can revoke members or dissolve the family. Members can leave voluntarily, but cannot revoke other members or dissolve the family.
- Revocation or departure immediately removes Relay authorization, clears old location snapshots, and pauses publication until key rotation completes. Owner performs rotation upon opening the app; no background owner key distribution is required.
- Remaining members should obtain already-distributed new keys automatically through their **running native foreground service**, without opening the React UI. This is planned for Phase 2.3.3 and **not implemented**.
- Ordinary location collection, encryption, upload, and background operation must work while the screen is locked and React UI is absent. Explicit stop / recent-app swipe should stop sharing as agreed during Phase 1 testing.
- Relay must not see plaintext coordinates or raw family content keys. The LAN HTTP relay is development-only and must not be exposed to the public internet.

## 2026-11-01 progress update

- Client now retains structured HTTP errors via `RelayHttpError` (`4d38681`).
- Development Relay now distinguishes revoked membership during challenge requests (`3b70998`).
- Client UI still retries after removal; no new device acceptance has been completed.
- Regression tests and a verifiable revocation-state protocol are still pending. Relay state is in memory, so a status code alone must not trigger local key deletion.
- Next: add tests, establish safe status verification, implement UI cleanup, then retest removal and dissolution.

## 2026-11-02 progress

- `6b638e1`: foreground key-sync UI now distinguishes a Relay `MEMBERSHIP_REVOKED` error from transient retry failures, displaying `Access revoked - verification required`.
- This is a non-destructive interim diagnostic: it does not automatically delete family keys or membership. The marker is not independently verified, and no new device acceptance or CI result has been confirmed.
- Regression test submission was blocked; add tests for revoked/unknown devices and temporary failures before relying on the status.
- Next: define trustworthy revocation/dissolution confirmation, handle state transitions safely, validate on both devices, and finish 2.3.2 acceptance.

## 2026-11-03 progress

- `1bd87b2`: once the client receives `MEMBERSHIP_REVOKED`, the foreground key-provisioning retry loop stops for that family and displays `Access revoked - verification required`. This is deliberately **non-destructive**; it does not clear keys or membership.
- `66ea427`: new Relay regression test checks that a revoked member receives the distinct error while an unknown device does not.
- `3e391f3`: CI's `test:relay` command includes both Relay test files.
- No new CI run or physical-device acceptance has been confirmed for these commits. The revocation marker remains an in-memory, unverified development signal. Next: validate tests, design authenticated membership status and safe local cleanup, then repeat two-device acceptance.

## 2026-11-04 progress

- `4c39ec2` extends the Relay regression test to distinguish an unknown device from a revoked member and to check revoked access to the key-read endpoint.
- A plain HTTP `MEMBERSHIP_REVOKED` marker is **not** a trustworthy authorization to erase local keys. Do not implement automatic destructive cleanup until the client can verify an Owner-authorized, family-bound revocation statement and distinguish missing server state after restart.
- Recommended protocol: on Owner removal, produce an Owner-signed statement binding family ID, removed device ID, key epoch and action. Relay stores and returns the statement; Member verifies it against a previously pinned Owner identity key. Persist status or define explicit recovery semantics before relying on it across Relay restarts. A signed statement must be replay-resistant and tied to a monotonically increasing epoch.
- The current local family store contains member IDs but does not pin the Owner public signing key; this is a prerequisite for verifying Owner-signed removal. Key rotation and local cleanup must be tested as separate steps.
- Next: pin the Owner identity key during authenticated pairing, implement and test signed revocation evidence, then safely stop family sharing and clear family-specific state. Do not delete the device identity key.
- New CI and device results are not yet confirmed for this update. Phase 2.3.2 remains open.

## 2026-11-05 progress

- `7ee5002`: local family membership now persists `ownerDeviceId` and `ownerPublicKey`, clears both on leaving/reset, and refuses to replace a previously pinned owner identity with a different value.
- `d187e72`: after verifying the registered exchange-key binding, provisioning records the Owner signing identity and persists it before proceeding with family key exchange. Missing Owner identity or a changed pinned key causes provisioning to fail.
- **Trust boundary:** first-use pinning currently relies on the development Relay's exchange response. Signature verification proves possession of the presented key, not that the presented key belongs to the intended human Owner. A secure QR/in-person fingerprint check or authenticated invitation binding is needed before treating this as a fully trusted anchor.
- **Migration:** existing memberships lack the new fields; they will be pinned on the next successful provisioning. This is not an independently authenticated migration.
- No Owner-signed revocation statement, automatic local key cleanup, or two-device acceptance has been completed yet. The latest TypeScript/CI result must be checked.
- Next: design and test Owner-signed, family/recipient/epoch-bound revocation evidence with replay protection; only after verification implement safe local cleanup and removal UX.

## 2026-11-06 progress

- `d262b45`: added `src/core/family/ownerRevocation.ts` with a canonical, versioned Owner revocation statement and verification helper. The verifier checks family, Owner and target member IDs, increasing key epoch, Owner public-key fingerprint, and the Owner's signature.
- This is a **foundation only**: no Relay transport/storage for the signed statement, no Owner UI signing integration, no Member automatic cleanup, and no device acceptance yet. Do not present it as a complete revocation protocol.
- The pinned Owner key still uses first-use trust via the development Relay. A QR/fingerprint confirmation or authenticated invitation binding remains necessary for stronger identity assurance.
- Next: define durable statement delivery, add positive/negative signature tests, integrate Owner signing and Member verification, and handle recovery after Relay restart. Only then allow verified cleanup. Run CI before device acceptance.

## 2026-11-07 progress

- `cb06208`: Relay client now sends an Owner-signed revocation statement with the revoke request.
- `96fccc1`: Owner removal UI signs a versioned statement binding family ID, Owner ID, removed member ID, and the next key epoch.
- `a84f975`: Relay checks the statement fields, expected epoch, and Owner signature **before** removing the member; it retains the signed statement in its in-memory revoked-membership record.
- `4b2411f`, `3d73942`: existing Relay tests updated to submit signed revocations.
- **Not yet complete:** Relay does not return the signed statement to the removed Member; Member-side signature verification and automatic cleanup are not wired. In-memory state is still lost on Relay restart. The Owner public key is pinned on first use, without out-of-band identity confirmation. New CI results and device acceptance are pending.
- Next: add tampered signature/epoch/target tests, deliver signed evidence to Member, verify against pinned Owner key and local epoch, and only then implement safe family-specific cleanup. Keep 2.3.2 open.

## 2026-11-08 progress

- `3e4e374`: the development Relay now includes the stored Owner-signed revocation statement and signature in a revoked member's challenge error, when available.
- `e56a4e2`: `RelayHttpError` exposes the optional signed evidence to the client without treating it as trusted automatically.
- `84782c5`: the active-screen retry handler checks the statement against the locally pinned Owner identity, family, recipient, and local key epoch. It displays `Owner removal verified - cleanup pending` only after signature verification; otherwise it keeps the unverified status. **No key or membership deletion occurs.**
- `0524e08`, `99baeb6`: Relay regression test checks evidence delivery and verifies the signature.
- **Remaining:** handle initial/restored/manual-sync errors consistently, protect against stale asynchronous UI updates, implement verified cleanup and user notification, and define durable Relay state/restart behavior. First-use Owner key pinning is still only as trustworthy as initial pairing. Latest CI and device acceptance are not yet confirmed.
- Do not use the development LAN Relay for sensitive real-world location sharing. Phase 2.3.2 remains unaccepted.

## 2026-11-09 progress

- `bad115e`: verified Owner revocation now triggers client-side cleanup in foreground retry, initial restore, and manual key sync. After checking the pinned Owner signature, family/recipient binding and key epoch, the client stops the location service, deletes that family's content key, clears persisted membership, and returns to the create/join screen with a removal notice. Device identity keys are retained.
- `3412781`: verification exceptions are treated as unverified evidence rather than triggering cleanup.
- **Not yet accepted:** latest CI and physical Android/emulator behavior must be checked. Test removal while active, after app restart, with invalid signatures, during network loss, and after Relay restart. Inspect cleanup partial-failure recovery and asynchronous race behavior.
- The current service is a general location foreground service, not yet the Phase 2.3.3 family-specific encrypted uploader. Stopping it on removal also stops standalone location tracking; revisit this separation before final UX.
- The Relay is in-memory, and initial Owner identity pinning relies on the first pairing response. Neither is production-grade trust/persistence. Phase 2.3.2 remains pending until end-to-end acceptance.

## 2026-11-10 regression hardening

- `4027075`: extended the Node Relay test to reject forged Owner signatures, wrong key epochs, mismatched target members, and replayed removal requests. Each rejected request checks that the legitimate member remains authorized; a valid signed removal still succeeds.
- `f83459b`: guarded foreground key-sync UI updates against late responses after verified removal begins, and prevented manual synchronization from restarting during removal cleanup.
- **Validation pending:** check latest CI for both commits; neither automated React lifecycle tests nor physical Android/emulator acceptance have been completed for these changes.
- **Known recovery gap:** if cleanup fails partway through (for example, the native key deletion or membership preference write fails), the current session can remain in a blocked removal state. Implement an idempotent, persistent cleanup checkpoint and restart recovery before final acceptance. A verification result returned over the LAN cannot by itself replace a trusted initial Owner key binding.
- Next: add deterministic cleanup state-machine tests (including repeated signals, partial failures, app restart and late requests), then perform two-device removal and dissolution acceptance. Do not mark 2.3.2 PASS yet.

## 2026-11-11 progress — resumable verified removal

- `d1e43ba`: verified removal now has a persisted checkpoint in the existing native membership storage. Startup detects a matching `pendingVerifiedRemoval` and attempts to complete cleanup before returning normal family state. Completion stops the service, deletes the family key, clears membership, and preserves the device identity.
- `17abb3c`: the verified Owner removal path uses checkpoint + completion rather than an untracked sequence of destructive operations.
- `49a0ddb`: ordinary membership persistence rejects a pending-removal checkpoint rather than overwriting it with stale state.
- **Limitations:** this is not a transaction across Android preference writes and key storage. Concurrent async writes, failed checkpoint writes, process termination between native calls, and corrupted membership JSON need further device/fault-injection tests. A failed recovery currently surfaces as an initialization error; it does not silently rejoin the family.
- **Acceptance pending:** latest CI, Android build, OPPO/emulator removal while active and after restart, failure injection, network outage, and Owner dissolution. Automated Node Relay tests do not exercise native storage or React lifecycle.
- The development Relay remains volatile and initial Owner pinning lacks out-of-band verification. Do not use it for real sensitive location sharing; Phase 2.3.2 is not yet accepted.

## Phase 2.2 acceptance (user reported PASS)

OPPO physical Android phone created a family, emulator joined via the LAN relay, and both displayed two members. Six-character invitation generation and development HTTP cleartext access were fixed. This acceptance predates the new Phase 2.3 authentication protocol; it does **not** validate the current main branch.

## Phase 2.3 implementation status

| Workstream | Current state |
| --- | --- |
| 2.3.1 Keystore device identity and family membership persistence | Code committed; Android validation pending |
| Signed challenge authentication, public key identity checks, signed request method/path/body | Code committed; protocol tests pending |
| AES-GCM family content key and Keystore wrapping | Code committed; Android validation pending |
| ECDH exchange public key binding and encrypted key packages | Code committed; end-to-end tests pending |
| Family key epochs, revocation, owner rotation, leave/dissolve | Member leave observed working; Owner revoke partially passed, but removed Member remains in Retrying; epoch proof and dissolve tests outstanding |
| Auto provisioning after create/join/restore | Create/join and visual reopen/restore observed working on two devices |
| Active-screen retry every 15 seconds | Code committed; not background execution |
| Owner Remove, Member Leave, Owner Dissolve UI | Code committed; Android validation pending |
| Both-sides Ready handshake / confirmation | Observed Ready on physical Android + emulator after automatic pairing; negative/security coverage incomplete |
| Native background receipt of rotated keys | Not implemented; Phase 2.3.3 |
| Native background encrypted location upload and peer display | Not implemented; Phase 2.3.3 |
| TypeScript / Kotlin build and security test suite | Relay and TypeScript CI passed; Kotlin Debug compile passed locally; further integration/security tests needed |

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

1. Fix revoked Member remaining in Retrying, add explicit safe membership-status handling, and test revoked-device cleanup. See [handoff](project-handoff-2026-10-31.md).
2. Run TypeScript checks, Kotlin/Gradle compilation, and relay protocol tests.
3. Verify OPPO + emulator: initial pairing, restart identity persistence, same-key proof, leave/revoke/dissolve, epoch rotation, unauthorized access denial.
4. Phase 2.3.3: native encrypted background location upload, peer-location read/decrypt, and native receipt of rotated keys.
5. Do not mark Phase 2.3 PASS until background location sharing and all safety checks pass.
