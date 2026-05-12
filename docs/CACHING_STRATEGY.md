# Jagoo Bahee Backend Caching Strategy

Implemented date: 2026-05-12

## Goals

- Reduce repeated Mongo reads on hot public pages.
- Keep cache invalidation conservative and easy to reason about.
- Use Redis so cache behavior is shared across horizontally scaled backend replicas.

## Cache Store

- Redis via `RedisService`.
- Default TTL: `CACHE_TTL_SECONDS || 60`.
- Cache failures are non-fatal; request handling falls back to Mongo.
- Cache keys use stable JSON serialization so ObjectIds and ordered filters do not collide.

## Cached Reads

Subreddits:

- `SubredditsService.findOne(idOrName)`
- `SubredditsService.findAll(filter, limit, skip)`

Posts:

- `PostsService.findById(id)`
- `PostsService.findAll(filter, limit, skip)`

Comments:

- `CommentsService.findById(id)`
- `CommentsService.findByPost(postId, limit, skip)`

Users:

- `UsersService.findById(id)`
- `UsersService.findByAuthId(authId)`
- `UsersService.findByUsername(username)`

Subreddit permissions:

- `SubredditMembersService.getPermissionSummary(subredditId, userId)`
- `SubredditsService.hasPermission(actorAuthId, subredditId, permission)` internal path

## Invalidation Rules

Subreddit cache invalidates on:

- create
- update
- delete
- join
- leave
- kick
- ban member-count transition
- add/remove moderator

Post cache invalidates on:

- create
- update
- author delete
- vote counter changes
- comment count changes
- moderation approve/remove/lock/unlock/pin/unpin/flag/unflag

Comment cache invalidates on:

- create
- update
- author delete
- vote counter changes
- moderation approve/remove/collapse/uncollapse/flag/unflag

User cache invalidates on:

- profile creation
- profile update

Subreddit permission cache invalidates on:

- member creation/removal
- member status update
- member ban
- join/leave
- kick/ban
- add/remove moderator

## Key Prefixes

- `jb:subreddits:one:*`
- `jb:subreddits:list:*`
- `jb:posts:one:*`
- `jb:posts:list:*`
- `jb:comments:one:*`
- `jb:comments:post:*`
- `jb:users:id:*`
- `jb:users:auth:*`
- `jb:users:username:*`
- `jb:member:*`
- `jb:permissions:*`

## Remaining Work

- Add Redis-backed storage for Nest throttling, not only application data caching.
- Add cache metrics for hit/miss/invalidation count.
- Replace broad pattern invalidation with tag sets if write volume becomes high.
- Add e2e tests that verify stale feed/post/comment data is not served after writes.
