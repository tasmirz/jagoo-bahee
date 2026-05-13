# Seeding And Permissions

## Seed Command

Run:

```bash
just seed
```

or:

```bash
pnpm --dir backend seed
```

The seeder is idempotent. It upserts deterministic development fixtures:

- 5 pseudonymous users
- 3 communities
- member/moderator/contributor status flags
- 5 signed posts
- 6 signed comments
- votes/reactions for posts and comments
- 1 award type and award
- 1 signed message
- 1 moderation log entry

Latest verification on 2026-05-13:

- `pnpm --dir backend seed` completes successfully against `mongodb://localhost:27018/jagoo-bahee`.
- Seeded dataset reported: 5 users, 3 communities, 5 posts, 6 comments, 36 votes, and 1 message.

Seed users:

- `seed_admin`
- `seed_mod`
- `alice_keys`
- `bob_reader`
- `charlie_builder`

## Current Permission Model

The current backend is not yet a full `roleXpermission` and `userXrole` relational RBAC model.

Implemented today:

- Global account flags live in `Auth.abac` as a bigint bitmap.
- Per-community membership and role-like flags live in `SubredditMember.statusFlags` as a bigint bitmap.
- `SubredditMembersService.getPermissionSummary()` derives granular permission strings from those flags and caches the result in Redis.

Important bits:

- `Auth.abac` bit 4: global moderator
- `Auth.abac` bit 5: global admin
- `SubredditMember.statusFlags` bit 0: member
- `SubredditMember.statusFlags` bit 1: muted
- `SubredditMember.statusFlags` bit 2: banned
- `SubredditMember.statusFlags` bit 3: moderator
- `SubredditMember.statusFlags` bit 4: contributor

Still needed for true granular RBAC:

- `Permission` schema with stable integer/bit identifiers.
- `Role` schema with `permissionMask` or normalized role-permission rows.
- `UserRole` assignment schema scoped by community.
- Migration from `statusFlags` to explicit role assignments, or a compatibility layer that derives default roles from current flags.
