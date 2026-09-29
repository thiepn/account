# THIEPN Account data lifecycle

## Distinctions

These states remain independent:

```text
Account connection
≠ live cloud-data namespace
≠ synchronization state
≠ backup snapshot
≠ local device data
```

Disconnecting an app changes Account access metadata and grants. It does not delete the app's live cloud data.

## Production inventory

P16 exposes metadata, not payload content.

For each supported app the Account service may report:

- whether a live namespace exists;
- whether that namespace is active or retained after disconnect;
- approximate stored row/payload bytes;
- record count;
- latest known cloud update;
- source revision/schema version where the app actually has one;
- sync status only when the source backend can support that claim.

## Source semantics

### Notes

Cloud data: `notes_sync_records`.
The Account surface can count/version server records, but cannot see pending local-only edits, so generic sync health is unavailable.

### Diet Copilot

Cloud data spans multiple owner-scoped Diet tables. Account aggregates metadata only. There is no generic Account sync command.

### TMS60

`tms60_sync_state` is an explicit revisioned cloud-sync state source, so the Account surface can report its latest server sync timestamp/revision.

### WORDSTRIKE

`wordstrike_player_profiles` exposes revisioned cloud profile state. No generic Account sync command is assumed.

### Word to the Nations

`wttn_private.saves` is a revisioned canonical cloud save with tombstone behavior. Deleted tombstones are not presented as live cloud data.

## Core

This inventory does not mean THIEPN Core Sync Protocol v1 has been implemented across the ecosystem. Core protocol rollout remains separate infrastructure work.


## Recovery plane

P17 adds a common Account view over app-owned recovery artifacts without pretending they share the same storage implementation.

### Diet

Private snapshots contain complete owner-scoped Diet state, SHA-256 payload/schema verification and row-count/schema validation. Account can inventory them, but browser restore is blocked because the Diet recovery contract requires operator review.

### TMS60

Backups store one translation snapshot. P17 adds a persisted SHA-256 state hash to all existing/future backup rows.

An Account restore:

- verifies the backup hash;
- makes a safety backup of the current translation first;
- writes the selected historical state as a new higher revision;
- leaves a durable restore-operation record.

### Backup inclusion

`backup.include` is an explicit optional Account permission. Revoking it stops future Account-requested backups; it does not delete historical recovery artifacts.


## P18 deletion

### App data

Deletion is capability- and protocol-specific. Account does not translate a generic “delete” button into arbitrary table deletes.

WTTN is currently certified because its command:

- checks the expected revision;
- deletes checkpoint history;
- writes a higher-revision deletion tombstone;
- rejects stale writes through normal conflict handling.

TMS60 remains blocked until its sync protocol gains an equivalent deletion epoch/tombstone contract.

### Account identity

Full Account deletion is a separate seven-day lifecycle. Scheduling does not disconnect an app or delete one namespace immediately.

At finalization the canonical Auth user is deleted. Database rows with Auth-user cascade ownership are removed by their existing constraints. Notes storage objects are a preflight/finalization blocker because object storage is not an Auth-user FK cascade.
