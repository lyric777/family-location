# Project handoff — Family Location

**Updated:** 2026-10-31  
**Repository:** `lyric777/family-location`  
**Current milestone:** Phase **2.3.2** — secure pairing, membership, and family key lifecycle. **Not fully accepted.**  
**Read first:** this handoff, then [phase-2-3.md](phase-2-3.md), then the actual code. The README is the high-level product roadmap and should not be rewritten to track daily progress.

This file is intentionally project-only: no account details, personal names, device identifiers, invitation codes, real location coordinates, or private LAN addresses. It records both observed results and unverified implementation separately.

## 1. Product scope and confirmed decisions

Family Location is an Android-first, privacy-oriented family location-sharing and communication app built with React Native / Expo and native Android modules.

- No email/phone/password-based accounts for device identity. Device signing keys are held in Android Keystore; stable device ID derives from the public identity key. ECDH exchange keys are separate.
- **Owner** creates the family, invites devices, can remove members and dissolve the family.
- **Member** joins by invitation and can leave voluntarily; cannot remove other members or dissolve the family.
- In-person pairing: Owner and joining Member both keep the app **in foreground** until automatic key exchange and mutual Ready confirmation finish. Final UX must not require manual `Sync family key`. Short invitation code works; QR-based entry is a future UX improvement.
- On leave/revoke, Relay must immediately remove authorization and pause new publication until a fresh family content key has been distributed. Owner can perform rotation when next opening the app; no background **Owner-side key distribution** is required.
- **Remaining authorized Members** should retrieve an already-distributed rotated key through a running native foreground service without reopening the React UI. This belongs to **2.3.3**, not current 2.3.2.
- Routine location collection, encryption, and upload must continue with screen locked and React UI absent, provided the native foreground service remains alive. Explicit stop and recent-task swipe follow the previously agreed stop-sharing behavior; no promise of surviving OS force-stop or reboot.
- Relay should not see plaintext coordinates or raw family content keys. Current LAN HTTP Relay is a development prototype, not a production service; no public exposure or real-world sensitive location sharing until transport/security hardening.

Long-term roadmap (preserve in README): Phase 0 bootstrap; Phase 1 native background location; Phase 2 family pairing + secure sharing (2.0–2.3.3); Phase 3 local history/map; Phase 4 P2P; Phase 5 production reliability; Phase 6 walkie-talkie/calling; Phase 7 release.

## 2. Architecture and important files

| Path | Purpose |
| --- | --- |
| `app/index.tsx` | Pairing and sharing UI, Owner/Member actions, 15-second foreground key sync retry, current diagnostics |
| `src/core/family/localFamilyStore.ts` | Local device/family state persistence |
| `src/core/family/keyProvisioning.ts` | ECDH exchange-key registration, peer signature verification, wrapped content key distribution/import, Ready confirmation |
| `src/core/transport/HttpFamilyRelay.ts` | Signed challenge-based client requests; request timeout and sanitized request diagnostics |
| `modules/family-location/android/src/main/java/expo/modules/familylocation/FamilyIdentity.kt` | Android Keystore identity and signatures |
| `modules/family-location/android/src/main/java/expo/modules/familylocation/FamilyCrypto.kt` | ECDH, AES-GCM key wrapping/content encryption, key epoch, key confirmation |
| `modules/family-location/android/src/main/java/expo/modules/familylocation/FamilyLocationModule.kt` | React Native ↔ Android bridge |
| `modules/family-location/android/src/main/java/expo/modules/familylocation/FamilyLocationService.kt` | Native location foreground service |
| `scripts/dev-relay.mjs` | In-memory LAN family/invite/challenge/member/key-package/Ready state and encrypted envelope endpoints |
| `tests/relay.test.mjs` | Node built-in Relay protocol tests |
| `.github/workflows/validation.yml` | CI: Relay tests + TypeScript typecheck |
| `app.config.js`, `app.json`, `.env` | Expo runtime config; Relay URL comes from `EXPO_PUBLIC_RELAY_URL` via dynamic config |

### Configuration lesson learned

An older `app.json` contained a hard-coded LAN Relay URL, overriding the current `.env` value. This caused `Create family` to hang and eventually show `Network request failed` / `Aborted` on **both physical phone and emulator**, despite working browser `/health` checks. Fixed by removing the hard-coded URL and adding `app.config.js` that maps `EXPO_PUBLIC_RELAY_URL` to `extra.relayUrl`. The client reads `Constants.expoConfig?.extra?.relayUrl`.

Verify effective configuration using:

```powershell
npx expo config --type public --json | ConvertFrom-Json | Select-Object -ExpandProperty extra
```

Release APK bundles configuration at build time: changing `.env` alone does not update an installed APK. Android Release merged/final manifest was inspected and already allowed cleartext traffic; do **not** blindly reintroduce the HTTP-manifest workaround. Never commit real LAN IPs, keys, or environment-specific data.

## 3. Implementation and evidence as of handoff

| Area | Evidence / status |
| --- | --- |
| Phase 1 native location, IDLE/MOVING/LIVE, sensor diagnostics | Implemented and iteratively tested on a physical Android device; OEM recent-task swipe/recovery limitations were investigated. Not a fresh overnight reliability certification. |
| Phase 2.2 invitation pairing | Previously accepted with physical Android + emulator; both showed two members. Older protocol, distinct from 2.3. |
| Device identity + persistent membership | Implemented. Reopening both apps in 2.3.2 kept the same family and showed Ready; no independent byte-for-byte key verification. |
| Signed Relay authentication and authorization | Implemented. Automated Node tests passed in GitHub Actions. Coverage remains limited. |
| Keystore P-256 signing / ECDH, AES-GCM, key epochs | Kotlin Debug compile passed; real two-device 2.3.2 pairing reached matching Ready status. Further negative/rotation/crash tests needed. |
| Owner creates family; Member joins with six-character code | **Observed PASS** on physical Android + emulator using latest configured Relay. Both showed same family, two members, and `Family key: Ready`. |
| App close/reopen persistence | **Observed PASS (visual)** on both devices: same family/member count/Ready status. No explicit key bytes compared. |
| Member voluntarily leaves | **Observed PASS (visual)**: local exit and Owner remaining state behaved as expected. Epoch increment / cryptographic rotation not independently inspected. |
| Owner removes Member | **Partial PASS**: Owner side returned to one member and Ready; removed Member stayed in `Retrying`. This is the **current blocking bug**. |
| Owner dissolves family | UI/API implemented, but full fresh 2.3.2 end-to-end dissolution acceptance not separately documented. |
| Relay automated tests | GitHub Actions green for Relay and TypeScript, including tampered request/replay/mismatched confirmation additions. |
| Android build | `:family-location:compileDebugKotlin` reported `BUILD SUCCESSFUL`; Release APK built and installed during subsequent device tests. |
| Member list UI | Long device IDs pushed `Remove` off-card on physical device. Layout fix committed (`bfae986`) **after the tested APK**; needs validation in next build. |
| 2.3.3 native encrypted background location sync and rotated-key pickup | **Not implemented / not accepted.** |

**Do not mark 2.3.2 fully PASS** while revoked-member handling, rotation evidence, and dissolution/recovery checks remain open.

## 4. Current blocking issue: revoked Member remains in Retrying

**Reproduction:**
1. Create family on Owner device; join with second device.
2. Wait for two members and Ready on both.
3. Owner taps `Remove` for the Member and confirms.
4. Owner returns to one member and Ready.
5. Removed Member remains on the old family screen with `Family key: Retrying` indefinitely.

**Likely code path:** `app/index.tsx` runs `provisionFamilyKey()` every 15 seconds while foreground. Revoked device fails Relay challenge authorization (403), but the generic `catch` sets `Retrying` without distinguishing permanent loss of membership from transient network failures. This is a code-based hypothesis consistent with observation; capture explicit protocol response before declaring it fully proven.

**Required behavior:** On verified revocation, stop that family's sharing, delete local family content key, clear local membership, show an understandable `Removed from family` state, and do not retry indefinitely. When family is truly dissolved, show `Family dissolved`. Preserve data and retry for genuine temporary network/timeout failures.

**Security/robustness warning:** Do **not** interpret every HTTP 403/404 as revocation/dissolution. Bad signatures, invalid challenges, server restart (Relay is in-memory), stale URL, or transient errors may produce similar symptoms. Introduce explicit machine-readable membership-state / reason semantics and an authenticated or otherwise securely verifiable status protocol. Avoid relying on untrusted unauthenticated error bodies to trigger destructive local key deletion. Define how to distinguish a lost/restarted dev Relay from actual family dissolution. Consider retaining a local non-sensitive tombstone/status so UI can explain why pairing disappeared.

**Implementation sequence:**
1. Design status/error contract: `ACTIVE`, `REVOKED`, `DISSOLVED`, `UNKNOWN/UNAVAILABLE` (exact names flexible), with verifiable authorization semantics and restart-safe limitations clearly documented.
2. Make Relay and `HttpFamilyRelay` expose structured errors rather than string matching; add targeted tests for revoked, dissolved, wrong signature, Relay unavailable/restarted, and temporary network failure.
3. Update UI retry loop and local cleanup; stop foreground sharing when access is verifiably revoked, and avoid overlapping/late async writes restoring stale UI. Never silently erase identity signing keys when leaving a family.
4. Build, install on physical device and emulator, repeat revoke test. Check removed device cannot request `members`, `snapshot`, or new key packages. Check Owner rotates to new epoch and publication remains blocked until rotation complete.

## 5. Other risks and technical debt to address

- **Ready semantics:** one-member family can show `Ready` before anyone joins; this is correct only as current-member key readiness, not proof that second-device pairing completed. Show `Waiting for member` vs `Paired` distinctly in final UX.
- **Ready proof:** Relay currently compares deterministic HMAC confirmation values. It proves agreement on a value within the protocol but exposes a stable key-derived verifier to Relay. Review privacy/cryptographic implications and use a challenge-bound confirmation or safer proof if needed; do not mistake simple value matching for a formal security audit.
- **Key epoch safety:** Key ciphertext and epoch are persisted in separate preferences writes. Crash during rotation/import could leave mismatched state; test rollback/replay resistance and make updates atomic or recoverable.
- **Key package / membership races:** verify joining, revocation, distribution and `rotation-complete` concurrency; ensure old key packages cannot be reimported after a new epoch.
- **Invitation admission:** current invite is short-lived/single-use, but joining itself is based on possession of code. Confirm intended threat model and authorization; do not imply physical presence is cryptographically proven.
- **Relay persistence:** all maps are in memory. Restart destroys families, invites, Ready and key packages. No production persistence/recovery or secure transport.
- **UI:** manual `Sync family key` and `Refresh members` are debug aids; final UX should auto-sync and show meaningful states. Verify the `Remove` layout fix in the next APK.
- **Lifecycle:** a member removed while app is backgrounded must not continue unauthorized family sharing; native 2.3.3 work must handle this without requiring React UI.
- **Testing:** GitHub Actions currently checks Node Relay tests and TypeScript; no Android Gradle CI, instrumentation, crypto interop or exhaustive security suite. Add tests incrementally rather than claiming full coverage.
- **Privacy:** no raw coordinates, signing secrets, family AES keys, invitation codes, or device identifiers in logs/test fixtures/docs.

## 6. Immediate next steps — recommended order

**Priority 0 — finish Phase 2.3.2:**
1. Fix revoked Member stuck in `Retrying` with safe, distinguishable permanent-vs-transient errors and local cleanup; add regression tests.
2. Verify Owner removal leads to real epoch increment and fresh key; test revoked member cannot read snapshots or new key packages.
3. Test Owner dissolve and how other devices learn about it; address in-memory Relay restart ambiguity.
4. Rebuild APK and re-run two-device scenarios: create/join, both Ready, restart persistence, voluntary leave, Owner removal, Owner dissolution, network loss/recovery, mismatched key, retry behavior.
5. Verify member-list `Remove` layout fix; remove or hide manual key-sync debug control for release UX once automatic pairing is reliable.
6. Update [phase-2-3.md](phase-2-3.md) with test results and only then mark **2.3.2 PASS**.

**Priority 1 — Phase 2.3.3:**
- Native foreground service uploads authenticated, AES-GCM-encrypted location envelopes without a mounted React screen.
- Other members fetch/decrypt and display locations with timestamps/freshness.
- Remaining members retrieve rotated keys via the **running native foreground service** after Owner distribution, without opening the app.
- Network interruption/backoff, stale/replay prevention, stop-sharing semantics, device/OEM tests, privacy checks.

**Later:** Phase 3 local history/map; Phase 4 P2P/WebRTC; Phase 5 production reliability; Phase 6 audio communications; Phase 7 release. Preserve original roadmap in README.

## 7. Reproducing local checks (Windows PowerShell)

```powershell
cd <repo-directory>
git pull origin main
npm ci
npm run test:relay
npm run typecheck
npm run lint
npx expo config --type public --json | ConvertFrom-Json | Select-Object -ExpandProperty extra
```

Create a local, uncommitted `.env` with `EXPO_PUBLIC_RELAY_URL=http://<current-LAN-host>:8787`. Do not copy old IPs from screenshots or history. Start Relay in a separate terminal:

```powershell
npm run relay:dev
```

Native debug compile:

```powershell
cd android
.\gradlew.bat :family-location:compileDebugKotlin
```

Release APK build and device installation (select the correct serial from `adb devices`):

```powershell
.\gradlew.bat :app:assembleRelease
adb devices
adb -s <device-serial> install -r .\app\build\outputs\apk\release\app-release.apk
```

A native Kotlin/manifest/bridge change requires a new APK; JS changes in a Release APK also require rebuilding/rebundling unless a compatible OTA update is actually configured. The physical phone and emulator should reach the same current LAN Relay. Avoid clearing app data unless intentionally testing first-install behavior; it can change local keys/identity.

## 8. Useful known commits and CI

- `a0fa1b1`: map Expo Relay URL from environment through dynamic app config; `03cacac`: remove hard-coded URL.
- `af185ae`, `08b8ad4`: request timeout/diagnostics and creation-stage UI.
- `bfae986`: member ID / Remove button layout fix (requires visual retest).
- `0cdde5a`: Relay tampering/replay/mismatched-key tests.
- `a694889`: distinguish Owner and Member waiting states.
- `18e6753`: GitHub Actions validation workflow.
- GitHub Actions validation jobs (`relay`, `typescript`) were reported green. Kotlin compile was separately reported successful on Windows.

## 9. Handoff instructions for the next developer or AI assistant

1. Read this file and `docs/phase-2-3.md`, inspect `main` and current CI, then review the relevant implementation. Do not assume this document supersedes newer code/commits.
2. **Start with the revoked Member `Retrying` bug.** Do not jump to Phase 2.3.3 or redesign the Owner/Member permission model.
3. Treat observations, code-complete claims, and acceptance as distinct. Do not claim a feature is verified because a commit or typecheck exists.
4. Make small, reviewable English Conventional Commits; keep project docs updated after meaningful changes. Do not rewrite README's original structure/roadmap unless explicitly requested.
5. Never include personal details, account details, real IPs, device IDs, invite codes, private keys, or location data in documentation or commits.
6. Prefer focused tests and explicit acceptance instructions; avoid repeatedly asking for huge Android logcat dumps. Use filtered diagnostics and clearly labeled steps.
