# Phase 1 - Background location reliability

## Milestone 1: foreground service + fused location

This milestone deliberately does one thing: prove the Android location service can run independently of the React Native screen.

### Implemented

- Local Expo Module in `modules/family-location`
- Android foreground service with a persistent notification
- Google Play Services Fused Location Provider
- Fine/coarse location permissions declared by the module manifest
- Location samples stored in Android `SharedPreferences`
- React Native controls to start/stop the service
- React Native diagnostics that poll native service state and the latest sample

### Current sampling policy

This is intentionally conservative rather than "real-time":

- target interval: 30 seconds
- minimum interval: 15 seconds
- minimum displacement: 20 meters
- balanced-power accuracy

Adaptive idle/moving/live modes come later in Phase 1 after basic survival is proven.

## Acceptance test

Because `android/` is generated and ignored, regenerate it after pulling native-module changes:

```bash
git pull
npx expo prebuild --clean --platform android
npm run android
```

Then:

1. Tap **Start location sharing**.
2. Grant precise location permission.
3. Confirm the app shows **RUNNING**.
4. Confirm Android shows the persistent **Family Location — Location sharing is running** notification.
5. In the Android Emulator extended controls, set a location and wait for the coordinates to appear in the app.
6. Press Home. Wait at least one minute, change the emulator location again, then reopen the app.
7. Confirm the service still shows **RUNNING** and the last location/timestamp changed while the UI was backgrounded.
8. Tap **Stop location sharing** and confirm the persistent notification disappears and state becomes **STOPPED**.

## What this does not prove yet

- OEM-specific background killing behavior
- overnight survival
- battery impact
- reboot recovery
- force-stop recovery
- adaptive sampling
- background-location permission behavior after more aggressive lifecycle events

Those require later Phase 1 milestones and, especially, physical Android devices.

## Troubleshooting

If the emulator does not produce a location:

- make sure Android location services are enabled;
- use Emulator **Extended controls > Location** to send a test coordinate;
- wait at least 15-30 seconds after changing the coordinate.

Native changes require rebuilding the development build. Metro reload alone is not enough.
