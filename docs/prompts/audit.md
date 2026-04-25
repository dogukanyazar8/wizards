You are a Principal Software Engineer conducting a thorough technical audit of 
the "Wizards" application — a Discord/Slack-like real-time communication platform.
Phases 1 through 4 have been implemented. Before proceeding to Phase 5 (real-time 
messaging with Socket.io), perform a comprehensive audit to verify correctness, 
security, and readiness.

## What Has Been Built (Phases 1-4)
- Phase 1: Turborepo monorepo, Next.js 15, Prisma, Docker Compose (PostgreSQL + Redis)
- Phase 2: Complete database schema (User, Server, Channel, Message, DM, and 20+ models)
- Phase 3: Auth system (NextAuth v5, credentials + OAuth, JWT, login/register pages)
- Phase 4: Core layout (Discord-style 3-column), Server CRUD, Channel CRUD, invite system

## Audit Scope

### 1. PROJECT STRUCTURE AUDIT
Verify the following exist and are correctly configured:
- [ ] turbo.json has correct pipeline (build, dev, typecheck, lint)
- [ ] pnpm-workspace.yaml includes all packages
- [ ] All packages have correct name in package.json (@wizards/web, @wizards/db, etc.)
- [ ] Path aliases work (@/ for apps/web/src, @wizards/db, @wizards/types, @wizards/ui)
- [ ] .env.example is complete and .env is in .gitignore
- [ ] docker-compose.yml has postgres and redis with healthchecks and persistent volumes

Run and verify:
  npx turbo run typecheck
  npx turbo run lint
  Expected: 0 errors, 0 warnings

### 2. DATABASE SCHEMA AUDIT
Verify schema correctness in packages/db/prisma/schema.prisma:

- [ ] All models have proper @id, @default(uuid()), createdAt/updatedAt
- [ ] All foreign keys have corresponding @@index
- [ ] Cascade deletes are correct:
      Server deleted → channels, members, roles, bans, invites cascade
      Channel deleted → messages, readStates cascade
      User deleted → sessions, accounts, serverMembers cascade
      Message deleted → reactions, mentions, attachments cascade
- [ ] Soft delete exists on Message.deletedAt and DMMessage.deletedAt
- [ ] No orphaned enums (every enum is used in at least one model)
- [ ] content_search tsvector column exists on Message and DMMessage
- [ ] GIN indexes exist for full-text search

Run and verify:
  cd packages/db && npx prisma validate
  npx prisma db push --preview-feature
  Expected: "Your database is now in sync"

Also verify in Prisma Studio (npx prisma studio) that all tables exist
and relations are navigable.

### 3. AUTHENTICATION AUDIT

#### Security Checks
- [ ] Passwords are hashed with bcrypt, minimum 12 salt rounds
- [ ] passwordHash is NEVER returned in any API response or session
- [ ] JWT secret is loaded from NEXTAUTH_SECRET env variable (not hardcoded)
- [ ] Refresh tokens are httpOnly cookies (not accessible via JavaScript)
- [ ] Session does not expose sensitive fields (no email in client-side session 
      unless explicitly needed)
- [ ] OAuth accounts are correctly linked to User via Account model

#### Functionality Checks
- [ ] Register: creates User + UserSettings + UserNotificationSettings in a 
      single Prisma transaction
- [ ] Register: validates email uniqueness with clear error message
- [ ] Register: validates username uniqueness with clear error message
- [ ] Register: username only allows letters, numbers, underscores (regex validated)
- [ ] Login: returns "Invalid email or password" for BOTH wrong email AND wrong 
      password (do not reveal which one is wrong — prevents user enumeration)
- [ ] Login: handles OAuth users (null passwordHash) without crashing
- [ ] Logout: properly destroys session

#### Route Protection Checks
- [ ] /channels/* → redirects to /login if unauthenticated
- [ ] /settings/* → redirects to /login if unauthenticated
- [ ] /login → redirects to /channels/@me if already authenticated
- [ ] /register → redirects to /channels/@me if already authenticated
- [ ] /invite/* → accessible without authentication

#### Manual Test — run these in browser:
  a. Register new account → should land on /channels/@me
  b. Logout → should land on /login
  c. Login with correct credentials → should land on /channels/@me
  d. Login with wrong password → "Invalid email or password" (not "wrong password")
  e. Login with non-existent email → same error as above (no user enumeration)
  f. Register with duplicate email → clear error, form stays filled
  g. Register with duplicate username → clear error, form stays filled
  h. Directly visit /channels/@me without login → redirected to /login
  i. Access /login while logged in → redirected to /channels/@me

### 4. LAYOUT & UI AUDIT

#### Structure Checks
- [ ] 3-column Discord-style layout renders correctly:
      Column 1 (72px): server icon rail + DM button at top
      Column 2 (240px): channel/DM list + user info bar at bottom
      Column 3: main content area with header
- [ ] User info bar shows: avatar, username, status indicator, settings icon
- [ ] Server rail shows all servers the user is a member of
- [ ] Active server/channel is visually highlighted
- [ ] Layout is responsive (sidebars collapse on mobile)

#### Server Management Checks
- [ ] Create server: name + icon upload works, server appears in rail immediately
- [ ] Edit server: changes persist after page refresh
- [ ] Delete server: only owner can delete, requires confirmation, 
      removes from rail immediately
- [ ] Server context menu (right-click): shows correct options based on role
      (Owner sees: Settings, Invite, Delete)
      (Member sees: Settings, Invite, Leave)

#### Channel Management Checks  
- [ ] Create text channel: appears in sidebar under correct category
- [ ] Create voice channel: appears with voice icon
- [ ] Edit channel: name change persists
- [ ] Delete channel: removed from sidebar, requires confirmation
- [ ] Channel categories: collapsible, channels reorder correctly
- [ ] Channel permissions: only Owner/Admin see edit/delete options

#### Invite System Checks
- [ ] Generate invite: produces unique code
- [ ] Invite link is copyable
- [ ] Expiry options work (1h, 24h, 7d, never)
- [ ] /invite/[code] page: shows server info + join button
- [ ] Join via invite: user appears in server member list
- [ ] Expired invite: shows appropriate error
- [ ] Invalid code: shows appropriate error

### 5. API ROUTES AUDIT
Verify all API routes under /api/v1/:

- [ ] All routes require authentication (return 401 if no session)
- [ ] All inputs validated with Zod (return 400 with clear errors on invalid input)
- [ ] Unknown/extra fields stripped from inputs (Zod strict mode)
- [ ] Role-based authorization enforced:
      Only OWNER can delete server
      Only OWNER/ADMIN can create/delete channels
      Only OWNER/ADMIN can kick members
- [ ] No raw SQL queries (all DB access through Prisma)
- [ ] Error responses follow consistent shape: { error: string, code?: string }
- [ ] No sensitive data (passwordHash, tokens) in any response

Check each endpoint:
  POST /api/v1/servers → creates server, returns server object
  GET  /api/v1/servers → returns user's servers
  PATCH /api/v1/servers/[id] → updates server (owner/admin only)
  DELETE /api/v1/servers/[id] → deletes server (owner only)
  POST /api/v1/channels → creates channel (owner/admin only)
  PATCH /api/v1/channels/[id] → updates channel
  DELETE /api/v1/channels/[id] → deletes channel
  POST /api/v1/invites → generates invite
  GET  /api/v1/invites/[code] → returns invite info (public)
  POST /api/v1/invites/[code]/join → joins server

### 6. DATA FETCHING & STATE AUDIT
- [ ] TanStack Query used for all server data fetching (no raw fetch in components)
- [ ] Loading skeletons shown while data fetches
- [ ] Error states handled (show error message, not blank screen)
- [ ] Optimistic updates on create/edit/delete operations
- [ ] Zustand store used for UI state (modals, active server/channel)
- [ ] No prop drilling beyond 2 levels (use Zustand or context)
- [ ] Query cache invalidated correctly after mutations
      (e.g. after creating a channel, channel list refetches)

### 7. TYPESCRIPT & CODE QUALITY AUDIT
- [ ] Zero TypeScript errors across all packages
- [ ] Zero ESLint errors or warnings
- [ ] No `any` types anywhere
- [ ] No `console.log` left in production code (only console.error for errors)
- [ ] All async functions have proper error handling (try/catch)
- [ ] No unused imports or variables
- [ ] Environment variables accessed through a typed config object, 
      not directly via process.env throughout the codebase

Run:
  npx turbo run typecheck
  pnpm --filter @wizards/web lint
  Expected: clean output

### 8. PERFORMANCE & BEST PRACTICES AUDIT
- [ ] next/image used for all avatar and server icon rendering
- [ ] No layout shift on page load (proper image dimensions set)
- [ ] No unnecessary re-renders (check with React DevTools if possible)
- [ ] Database queries don't fetch unnecessary fields 
      (use Prisma select to limit fields)
- [ ] No N+1 query problems (use Prisma include strategically)

### 9. PHASE 5 READINESS CHECKLIST
Verify these are in place before real-time messaging can be built:

- [ ] Channel model has TEXT type channels in the database
- [ ] Message model exists with channelId, userId, content, createdAt, deletedAt
- [ ] ChannelReadState model exists (needed for unread badges)
- [ ] User is correctly associated to ServerMember records
- [ ] Auth session exposes user.id (needed for socket authentication)
- [ ] Redis is running and reachable (docker compose ps)
- [ ] Redis connection can be established from Next.js:
      Create a temporary test at /api/test-redis that does SET/GET and returns result
      Delete this endpoint after verification
- [ ] Socket.io package is NOT yet installed (will be installed in Phase 5)
- [ ] The 3-column layout has a dedicated area ready for MessageList component
- [ ] The layout correctly reads the active channelId from the URL params

## Output Format
For each audit section, provide:

✅ PASS — item is correctly implemented
⚠️ WARNING — item works but has a minor issue or could be improved  
❌ FAIL — item is broken, missing, or insecure (must fix before Phase 5)

At the end, provide:
1. A summary table of all FAIL and WARNING items
2. Exact code fixes for every FAIL item
3. Recommended fixes for WARNING items
4. A clear statement: "READY FOR PHASE 5" or "NOT READY — fix X items first"

Do not proceed to Phase 5 until all FAIL items are resolved.