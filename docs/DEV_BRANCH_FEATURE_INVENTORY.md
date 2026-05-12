# Dev Branch Feature Inventory

Source reviewed: `origin/dev` at `bacb8bb`.

## Frontend Features To Port

- Full responsive navbar with search, mobile menu, profile menu, saved link, notifications, create post, and proof count.
- Home/explore feed tabs, joined-community home feed, feed sorting and pagination/infinite scroll.
- Reusable post surface: `PostCard`, vote buttons, share button, more menu, markdown renderer, report modal, award modal, loading skeletons.
- Post routes: create, detail, edit.
- Community routes: public community page, stats page, moderation layout, moderation overview, queue, members, moderators, roles, bans, settings.
- User routes: username profile page and `/u/*` compatibility route.
- Utility routes: global search, saved content, awards, acknowledgements/proof vault, notifications, messages, offline/PWA page.
- Client storage and verification: IndexedDB cache, acknowledgement vault, content verification helpers, server verification helpers, proof download helpers.
- PWA assets: `manifest.json`, service worker, updated logo assets.
- Context providers: auth context, user profile context, toast context.

## Backend Features To Port

- Refresh-token auth endpoints, logout, public-key lookup endpoint, cookie-aware JWT guard.
- Role and user-role schemas, roles controller, granular bitmap permission helper.
- Subreddit permission cache service backed by Redis.
- More complete subreddit moderation/member/role flows.
- More complete post/comment verification and acknowledgement flows.
- Attachment and MinIO setup hardening scripts.
- Docker compose updates and MinIO setup scripts.

## Integration Policy

- Keep current security work from `master` when it is stricter than `dev`.
- Prefer adding dev features as reachable routes/components over replacing current hardened endpoints blindly.
- Keep pnpm as the active package manager.
