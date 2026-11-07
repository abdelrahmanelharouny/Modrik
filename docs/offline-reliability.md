# Offline evidence recovery

## Persistence and retention
- Evidence create/update/delete operations are stored in IndexedDB with a stable UUID and FIFO timestamp.
- Queue capacity is bounded to 100 pending operations per project; evidence payloads are bounded by the queue validator.
- Pending work is not age-expired. It remains until the server acknowledges it or the user explicitly discards it. Browser storage eviction, private browsing cleanup, or clearing site data can still remove local data; IndexedDB is not a cross-device backup.
- The queue is browser-profile local and is not separately encrypted. Avoid highly sensitive evidence on shared devices.

## Recovery triggers
The elicitation stage reloads and attempts the persisted queue on mount, reconnect (online), window focus, pageshow, document visibility restoration, and a bounded 60-second recovery check. This handles ordinary tab suspension and browser restart; it does not promise background execution after all tabs are closed.

## Retry and human review
Transient failures use capped exponential backoff (5 seconds to 5 minutes). Revision conflicts, missing resources, authorization/permission failures, and validation failures pause automatic retries so the user can inspect the conflict, explicitly rebase an update, or discard the operation. The queue remains FIFO: a failed head item blocks later operations to preserve user intent.

## Concurrency and crash recovery
Web Locks are preferred where available. IndexedDB leases provide a fallback with a monotonically increasing fencing token and heartbeat. If a tab crashes, its lease expires and another tab can acquire a newer generation. A stale worker cannot acknowledge or rewrite an item after losing its lease. The server receives the same operation UUID on retry to make uncertain network outcomes idempotent.

## Remaining limits
- No background sync guarantee while every tab is closed.
- No file/audio blob queue, cross-device replication, or separately encrypted local store.
- Browser storage can still be evicted by the browser or removed by the user.
- A true disaster-recovery guarantee requires a server-side draft/attachment protocol and explicit product/security decisions.
