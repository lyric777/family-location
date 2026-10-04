# Phase 2.0 - Family sync protocol

Phase 2.0 defines the data and transport boundaries before choosing a concrete relay.

## Goals

- No email, phone number, username, or password.
- A locally generated device identity represents one installation.
- One device creates a family; another joins using an invite code.
- The relay stores membership/public-key metadata and only the latest opaque encrypted envelope per device.
- Plaintext coordinates are not part of relay storage or relay APIs.
- The same application boundary can later be backed by WebRTC/P2P.

## Domain model

DeviceIdentity contains deviceId, displayName, and createdAtMs. Family membership contains familyId, deviceId, role, and joinedAtMs. Latest device state contains familyId, deviceId, an encrypted envelope, and receivedAtMs.

deviceId is an opaque stable identifier. Phase 2.0 intentionally does not prescribe its final derivation; a later Keystore identity can replace its implementation without changing the relay protocol.

## Payload and envelope

LocationPayload is plaintext only before encryption on the sender and after decryption on an authorized family device. It contains latitude, longitude, accuracyMeters, timestampMs, and mode.

Relay-facing EncryptedEnvelope contains protocol version, familyId, senderDeviceId, messageId, sentAtMs, kind, nonce, and ciphertext. Routing metadata is visible; coordinates are not.

## Minimal relay operations

- createFamily: owner device ID + public key -> family ID + invite code
- joinFamily: invite code + joining device ID + public key -> family ID + member public keys
- publishLocation: encrypted envelope -> acknowledgement
- getFamilySnapshot: family/device identity -> latest encrypted envelope for each family device

Concrete authentication proof, invite expiry, encryption/key agreement, replay protection, and relay implementation are deliberately deferred to the next Phase 2 steps. They must be defined before exposing the protocol to an untrusted network.

## Retention

The Phase 2 relay keeps only the latest encrypted location envelope per device. Track/history remains local-first. Bounded encrypted offline catch-up can be added later.

## Acceptance

- TypeScript domain/protocol types compile.
- No relay-facing type contains plaintext latitude/longitude.
- FamilyTransport does not depend on HTTP or WebRTC.
- Protocol version is explicit.
- Deferred security work is documented rather than silently assumed.
