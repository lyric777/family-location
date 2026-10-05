# Phase 2.1 - Local pairing flow

This step adds a UI-visible create/join family flow on top of the Phase 2.0 protocol types.

Important: Phase 2.1 is deliberately local-only. It does not pretend that two phones are paired before a relay exists. The create flow generates a family ID and six-character invite code. The join flow validates and records an invite as pending. Phase 2.2 will replace this local adapter with a real FamilyTransport relay implementation and make two-device membership authoritative.

The temporary identity and family state are in-memory and reset when the JavaScript runtime restarts. This is intentional for the 2.1 UI/protocol acceptance step; durable secure identity is a later step.

Acceptance:
- Create family shows an owner family ID and six-character invite code.
- Join family accepts a six-character code and shows pending membership.
- Reset returns to the unpaired state.
- Existing Phase 1 location controls continue to work.
