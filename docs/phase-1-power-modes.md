# Phase 1 - Manual power modes

This milestone replaces the temporary always-high-accuracy diagnostic request with three native strategies.

| Mode | Priority | Target interval | Minimum interval | Minimum distance |
| --- | --- | ---: | ---: | ---: |
| IDLE | Low power | 5 min | 2 min | 100 m |
| MOVING | Balanced | 30 s | 15 s | 20 m |
| LIVE | High accuracy | 5 s | 2 s | 0 m |

The modes are manually selectable so their behavior can be validated before automatic movement detection is introduced.

## Acceptance

After pulling, regenerate/rebuild the native app:

```bash
git pull
npx expo prebuild --clean --platform android
npm run android
```

Start sharing and test:

1. **LIVE**: inject two emulator locations 10-20 seconds apart. The second should appear quickly.
2. **MOVING**: inject a location more than 20 m away and allow roughly 30-60 seconds for an update.
3. **IDLE**: verify that tiny/rapid location changes do not behave like LIVE. This mode is intentionally sparse and is better evaluated on a physical device later.
4. Switch modes while the service is running; the foreground-service notification should remain present.
5. Put the Activity in the background or swipe it from Recents while in LIVE/MOVING and confirm location updates continue.

These intervals are requests to Android, not exact timers.


## Emulator validation status

- LIVE: continuous injected-location updates verified.
- MOVING: native request switching reaches REGISTERED / active MOVING; Android Emulator GPS injection does not reliably exercise the balanced-power provider path, so movement updates are deferred to physical-device validation.
- IDLE: mode switching and foreground-service survival verified; battery behavior is deferred to physical-device testing.
- Next validation target: install the development build on a physical Android device and test MOVING while walking with the screen locked.
