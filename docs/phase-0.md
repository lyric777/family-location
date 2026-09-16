# Phase 0 - Bootstrap

## Purpose

Phase 0 establishes a React Native application that can grow native Android capabilities without coupling product UI to those implementations.

## Decisions

- Android first.
- Expo development builds, not Expo Go, because later phases require custom native Android code.
- `expo-updates` is the OTA client. xprem can serve compatible Expo Updates manifests/assets.
- `runtimeVersion` follows the app version for now. Any native compatibility change must ship as a new binary/app version before OTA updates target that runtime.
- Transport is represented by `FamilyTransport`; Phase 4 can add WebRTC without leaking WebRTC APIs throughout the app.
- No backend dependency in Phase 0.

## Local bootstrap

```bash
npm install
npm run doctor
npm run typecheck
npx expo prebuild --platform android
npm run android
```

After the Android project exists, Phase 1 will add the foreground location service and native bridge/module.

## xprem

Do not put an update URL into source control until an xprem deployment/project URL is chosen. At that point configure `expo.updates.url` (and any xprem-required request headers/channel configuration) according to the deployed xprem instance.

OTA-safe examples: React component changes, JS business logic, compatible assets.

New-binary examples: Android manifest/permissions, foreground-service types, native modules, native dependency changes, or changes that alter the JS/native compatibility contract.

## Phase 0 exit criteria

1. Dependencies install cleanly.
2. Expo Doctor passes or has only understood warnings.
3. TypeScript passes.
4. Android development build launches the bootstrap screen.
5. A development build can be rebuilt after `expo prebuild` without manual patching.
