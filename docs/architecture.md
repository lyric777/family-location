# Architecture

```text
UI / React Native
      |
      v
Application services
      |
      +---- Location facade ----> Android native location service (Phase 1)
      |
      +---- Local history ------> local database (Phase 2)
      |
      `---- FamilyTransport ----> WebRTC / relay (Phase 4+)
```

## Boundary rule

React Native owns presentation and application orchestration. Android owns behavior that must survive UI/background lifecycle changes. The foreground location service must not depend on a mounted React component to remain correct.

## Privacy rule

Location content and audio are not backend database records. Backend infrastructure introduced later is for rendezvous, family/device authorization, and connectivity support. Relay fallback may carry encrypted traffic but must not require plaintext family content.
