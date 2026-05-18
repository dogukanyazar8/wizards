# Workspace Performance Monitoring

Use this runbook to observe the CR-1 message fanout fixes in UAT before carrying them to production.

## UAT Env

Set these variables on the UAT web process and redeploy:

```env
WORKSPACE_PERFORMANCE_METRICS=true
WORKSPACE_PERFORMANCE_METRICS_INTERVAL_MS=30000
PERMISSION_CACHE_DISABLED=false
```

`PERMISSION_CACHE_DISABLED` should normally be unset or `false`. Keep the flag available as a rollback switch if Redis or cache behavior needs to be isolated quickly.

## Log Signal

Search application logs for:

```text
[workspace-performance]
```

The second log argument is JSON with `type: "workspace_performance"`. Each payload is an in-memory per-process window, so compare trends rather than treating one log line as a cluster-wide total.

## Healthy UAT Shape

- `messageSendFanout.maxActiveServerMemberCount` should track connected socket users in the server room, not total server membership.
- `messageSendFanout.maxUnreadUpdateUserCount` should stay at or below connected users who can see the channel.
- `permissionCache.channelSnapshot.error` and `permissionCache.visibleChannelList.error` should stay `0`.
- `permissionCache.*.miss` and `permissionCache.*.write` can spike after deploy or permission changes, then settle as Redis warms.
- `permissionCache.*.stale` should rise only after role, override, channel, or member changes.
- `unreadFanout.maxVisibilityGroupCount` should usually be low. A value close to target user count means users are resolving into many unique visible-channel sets.

## UAT Smoke

1. Deploy with the env values above.
2. Open two or more accounts in the same server and join the same text channel.
3. Send messages across public and restricted channels.
4. Wait at least `WORKSPACE_PERFORMANCE_METRICS_INTERVAL_MS`, then send one more message if no fresh log has appeared.
5. Confirm unread badges and live messages still update without refresh.
6. Check the log fields in the healthy-shape list.

## Rollback

Disable only the observation layer:

```env
WORKSPACE_PERFORMANCE_METRICS=false
```

If cache behavior itself must be isolated, temporarily set:

```env
PERMISSION_CACHE_DISABLED=true
```

That falls back to DB-backed permission resolution and should be treated as a short-term diagnostic switch, not a steady production setting.
