# Security Specification — CiscoSwitch Studio Firestore Rules

## 1. Data Invariants
1. Every document in `switchProfiles`, `fleetSwitches`, and `switchBackups` MUST belong to a verified authenticated user (`ownerId == request.auth.uid` and `request.auth.token.email_verified == true`).
2. `ownerId` and `createdAt` are immutable after creation; `createdAt` and `updatedAt` MUST equal `request.time`.
3. Document IDs (`profileId`, `switchId`, `backupId`) MUST pass `isValidId()` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
4. Shadow/extra keys are rejected on both `create` (`keys().hasAll(...) && keys().hasOnly(...)`) and `update` (`affectedKeys().hasOnly(...)`).
5. List queries enforce `resource.data.ownerId == request.auth.uid` directly in the rule (never delegated to client).
6. No passwords or SSH secrets are stored in `fleetSwitches` or `switchProfiles`.

## 2. Adversarial "Dirty Dozen" Payloads (All Must Return PERMISSION_DENIED)
1. Unauthenticated read/write to `/switchProfiles/p1` (`request.auth == null`).
2. Unverified email user (`email_verified == false`) creating a profile.
3. Identity spoofing: User A creating a profile with `ownerId: "user_B"`.
4. Shadow field injection on create: Adding `isAdmin: true` to `/switchProfiles/p1`.
5. Shadow field injection on update: Updating `profileName` while adding `extraField: 1`.
6. Modifying immutable `ownerId` or `createdAt` during update.
7. Client timestamp spoofing: Setting `createdAt` or `updatedAt` to a past timestamp instead of `request.time`.
8. Document ID poisoning: Creating `/switchProfiles/bad..id$with/chars` or >128 chars.
9. Oversized string resource poisoning: `profileName` > 100 chars or `hostname` > 64 chars.
10. Cross-tenant read/list/delete: User A reading or deleting User B's `switchProfiles` or `switchBackups`.
11. Invalid `fleetSwitches` port/mode: `port: 99999` or `mode: "telnet"`.
12. `switchBackups` update attempt (backups are immutable append-only snapshots; only create/read/delete by owner allowed).
