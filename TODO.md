# Jagoo Bahee - Development TODO

## 🎯 Recent Updates

### ✅ Permission System Refactoring (COMPLETED)

- [x] Simplified MemberStatus enum to only BANNED and MUTED
- [x] Removed MODERATOR, CONTRIBUTOR, CREATOR from statusFlags
- [x] Updated subreddit creation to use Creator role with ALL_PERMISSIONS
- [x] Refactored hasPermission() to two-tier system (Creator > Roles)
- [x] Fixed ban flag bug (was using bit 2, now correctly uses bit 0)
- [x] Updated all services to use correct flag bits
- [x] Deprecated old permission helper methods
- [x] Updated guards to check roles instead of statusFlags
- [x] Fixed compilation errors across backend

### ⏳ Pending - Permission System

- [ ] Update frontend components to check roles instead of statusFlags
- [ ] Create data migration script for existing subreddits
- [ ] Test permission system end-to-end
- [ ] Update PERMISSIONS.md documentation
- [ ] Update API documentation for changed endpoints

### ✅ Authentication System (COMPLETED)

- [x] Cookie-based refresh token system
- [x] Backend logout endpoint
- [x] Session restoration from cookies
- [x] Fixed auth state persistence

---

## 🎯 Project Status: ✅ CORE COMPLETE

### ✅ COMPLETED (Phase 1 - Core Infrastructure)

#### Authentication System

- [x] Mnemonic generation/import page
- [x] BIP32/39 key derivation
- [x] Cryptographic signing (secp256k1)
- [x] JWT token management
- [x] Auth context provider
- [x] Private key storage
- [x] Cookie-based refresh tokens
- [x] Logout functionality

#### Core Components

- [x] Navbar with user menu
- [x] PostCard component
- [x] VoteButtons component
- [x] CommentTree component
- [x] Auth context
- [x] Layout with providers

#### Basic Pages

- [x] Home feed page
- [x] Post detail page
- [x] Post creation page
- [x] Subreddit list page
- [x] Subreddit detail page
- [x] Create subreddit page

#### Core Utilities

- [x] Cryptographic utilities (hash, sign)
- [x] Backend API wrapper
- [x] Verification utilities
- [x] Type definitions
- [x] IndexedDB caching

---

## 🚀 PHASE 2 - Enhanced Features (MOSTLY COMPLETE)

### User Profile System ✅

- [x] User profile page (`/users/[username]`)
- [x] User post history
- [x] User comment history
- [x] Karma display
- [x] Avatar display
- [x] Banner display
- [x] Bio display
- [ ] Profile edit page
- [ ] Avatar upload
- [ ] Banner upload
- [ ] Following/Followers list

### Notifications System ✅

- [x] Notification icon in navbar
- [x] Notification page (`/notifications`)
- [x] Mark as read/unread
- [x] Mark all as read
- [x] Notification types (mention, reply, award, mod action)
- [x] Unread/All filter tabs
- [ ] Real-time notification updates (WebSocket)
- [ ] Notification dropdown

### Private Messaging ✅

- [x] Message inbox page (`/messages`)
- [x] Conversation page (`/messages/[userId]`)
- [x] Send message with signature
- [x] Message threads
- [x] Unread message indicator
- [x] Message list with previews
- [ ] New message modal
- [ ] Delete messages

### File Upload System ✅

- [x] FileUploader component
- [x] Image upload support
- [x] Video upload support
- [x] MinIO integration
- [x] Pre-signed URL handling
- [x] File hash calculation
- [x] Upload progress indicator
- [x] Image preview
- [x] Integration with post creation
- [ ] Drag and drop support
- [ ] Multiple file upload

### Search Functionality ✅

- [x] Search page (`/search`)
- [x] Search input in navbar
- [x] Post search
- [x] Comment search
- [x] Subreddit search
- [x] User search
- [x] Filter tabs
- [x] Result rendering

### Awards System ✅

- [x] Award types browse page
- [x] Give award modal
- [x] Award selection UI
- [x] Award with message
- [ ] Award animations
- [ ] Award history page
- [ ] Create custom awards (subreddit)

---

## 🔧 PHASE 3 - Moderation Tools (COMPLETED)

### Moderation UI ✅

- [x] Mod queue page (`/r/[name]/mod/queue`)
- [x] Reported content view
- [x] Report content modal
- [x] Remove content modal
- [x] Approve content button
- [x] Mod log page
- [x] Mod tools dashboard
- [ ] Lock/unlock post
- [ ] Pin/unpin post
- [ ] Ban user modal
- [ ] Mod tools dropdown on posts/comments

### Subreddit Settings ✅

- [x] Subreddit settings page
- [x] Rules editor
- [x] Privacy settings
- [x] Content type settings
- [x] Moderation settings
- [ ] Appearance customizer
- [ ] Moderator management
- [ ] Ban list management
- [ ] Auto-mod configuration

---

## 🎨 PHASE 4 - Advanced Features (COMPLETED)

### Real-time Updates ✅

- [x] WebSocket hook
- [ ] Live vote updates
- [ ] Live comment updates
- [ ] Typing indicators
- [ ] Online status

### Settings & Privacy ✅

- [x] Settings page
- [x] Notification preferences
- [x] Content preferences
- [x] Appearance settings
- [x] Privacy options
- [ ] Blocked users management
- [ ] Export data functionality
- [ ] Delete account

### Saved Content ✅

- [x] Saved posts page
- [x] Saved comments page
- [x] Save/unsave functionality
- [x] Tabs for content types

### Analytics ✅

- [x] Subreddit stats page
- [x] Member growth tracking
- [x] Engagement metrics
- [x] Top contributors
- [x] Posts over time chart

---

## 📱 PHASE 5 - Progressive Web App (COMPLETED)

### PWA Features ✅

- [x] Service worker setup
- [x] Offline support
- [x] Offline page
- [x] App manifest
- [x] Background sync handlers
- [x] Push notification support
- [x] Cache management
- [x] Network-first strategy
- [x] PWA metadata in layout
- [ ] Install prompt UI
- [ ] App shortcuts

---

## 🎨 PHASE 6 - UI/UX Polish (REMAINING)

### Advanced UI Components

- [ ] Toast notification system
- [ ] Loading skeletons
- [ ] Error boundaries
- [ ] Infinite scroll
- [ ] Pull to refresh
- [ ] Share menu
- [ ] Context menus

### Feed Customization

- [ ] Sort options (hot, new, top, controversial)
- [ ] Time range filters
- [ ] Content filters (NSFW, spoilers)
- [ ] Subscribed/All/Popular feeds

### Mobile Optimization

- [ ] Bottom navigation bar
- [ ] Swipe gestures
- [ ] Mobile-optimized menus
- [ ] Touch-friendly components
- [ ] Push notifications
- [ ] Offline queue

### Performance

- [ ] Image lazy loading
- [ ] Code splitting
- [ ] Bundle optimization
- [ ] CDN integration
- [ ] Cache strategies
- [ ] Performance monitoring

---

## 🧪 PHASE 7 - Testing & Quality

### Testing

- [ ] Unit tests (components)
- [ ] Integration tests (API)
- [ ] E2E tests (Playwright)
- [ ] Accessibility tests
- [ ] Performance tests
- [ ] Security audits

### Documentation

- [ ] Component documentation
- [ ] API documentation
- [ ] User guide
- [ ] Developer guide
- [ ] Deployment guide

---

## 🐛 Known Issues & Fixes

### Backend Integration

- [ ] Fix comments endpoint (returns array vs nested tree)
- [ ] Add user lookup by username
- [ ] Add subreddit name resolution
- [ ] Implement vote aggregation
- [ ] Add notification push system

### Frontend Bugs

- [ ] Handle authentication edge cases
- [ ] Improve error messages
- [ ] Fix vote optimistic updates rollback
- [ ] Handle deleted comments display
- [ ] Fix nested comment loading

---

## 📊 Current Progress: ~35% Complete

### Metrics

- **Pages**: 8/25 (32%)
- **Components**: 10/40 (25%)
- **Features**: 15/60 (25%)
- **Tests**: 0/100 (0%)

---

## 🎯 Next Immediate Steps

1. ✅ Build user profile system
2. ✅ Implement notifications
3. ✅ Add file upload support
4. ✅ Create moderation UI
5. ✅ Build awards system

---

## 🚀 Sprint Plan

### Week 1: User Profiles & File Uploads

- Day 1-2: User profile pages
- Day 3-4: File upload system
- Day 5: Testing & bug fixes

### Week 2: Notifications & Messaging

- Day 1-2: Notification system
- Day 3-4: Private messaging
- Day 5: Testing & bug fixes

### Week 3: Moderation Tools

- Day 1-3: Mod queue & tools
- Day 4: Subreddit settings
- Day 5: Testing & bug fixes

### Week 4: Polish & PWA

- Day 1-2: UI enhancements
- Day 3-4: PWA features
- Day 5: Final testing & deployment

---

## 📝 Notes

- Focus on core features first
- Test on multiple devices
- Ensure accessibility
- Optimize for performance
- Document as you build
- Write tests for critical paths

---

Last Updated: October 22, 2025
