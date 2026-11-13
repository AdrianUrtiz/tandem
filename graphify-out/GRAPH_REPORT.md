# Graph Report - tandem  (2026-11-13)

## Corpus Check
- 266 files · ~124,983 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: (none) 4, .ico 2, .xml 2)

## Summary
- 1314 nodes · 5114 edges · 63 communities (55 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 55 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Reminders and Statements
- Pairing and Settings UI
- Expense Sharing Inputs
- Category and Companion Management
- List Management Pages
- App Shell and Forms
- Bank Brand Icons
- Accounts and Statements
- Runtime Dependencies
- Subscriptions Management
- MSI Statements Engine
- Month State and Summaries
- Dev Dependencies
- Group and Auth Pages
- Account Cards and Forms
- Offline Sync Engine
- Transaction Entry and Outbox
- Group Expenses and Settlement
- Group Join and Invites
- Transaction Form Controls
- Account Sheets and Reorder
- Payment Confirmation Flow
- Activity Chart and Filters
- Pending Charges and Debts
- Category Management API
- Offline Data Models
- Debts and Cards UI
- Android App Icons
- Bottom Sheets and Gestures
- Group Settlement Math
- iOS App Icons
- TypeScript Config
- Confirmation and Pairing Items
- Category Catalog
- Monthly Summary Views
- App Layout and Navigation
- UI Component Config
- Group Detail Actions
- NPM Scripts
- Transaction Rows and Lists
- Prisma Seed and Config
- Filter State Stores
- Group Members Management
- Swipe Gestures and History
- Account Detail Views
- macOS App Icons
- Group Creation Flow
- UI Utility Dependencies
- Project Bootstrap Docs
- Household Pairing Utils
- Native Icon Integration
- Web PWA Icons
- Deployment and Env Config
- ESLint Config
- Web Manifest Setup
- Legacy Places Page
- Service Worker Cache
- Auth Prisma Adapter
- DnD Kit Core
- PostCSS Config
- macOS Icon Conversion
- Vercel Build Config
- Auth Route Handlers

## God Nodes (most connected - your core abstractions)
1. `cn()` - 115 edges
2. `auth` - 99 edges
3. `toCents()` - 96 edges
4. `formatMoney()` - 88 edges
5. `syncForce()` - 82 edges
6. `Button()` - 74 edges
7. `fromCents()` - 68 edges
8. `react` - 66 edges
9. `next` - 60 edges
10. `lucide-react` - 55 edges

## Surprising Connections (you probably didn't know these)
- `ResumenPage()` --indirect_call--> `byAccountOrder()`  [INFERRED]
  app/(app)/resumen/page.tsx → lib/accounts.ts
- `ActivityClient()` --indirect_call--> `byAccountOrder()`  [INFERRED]
  components/activity-client.tsx → lib/accounts.ts
- `cancel()` --calls--> `cancelPayment()`  [EXTRACTED]
  components/group-detail-client.tsx → lib/payment-actions.ts
- `submit()` --calls--> `createGroup()`  [EXTRACTED]
  components/group-sheets.tsx → lib/group-actions.ts
- `iconButton()` --calls--> `cn()`  [EXTRACTED]
  components/new-category-fields.tsx → lib/utils.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Environment configuration for datastore auth and rate limiting** — readme_env_config, readme_database_url, readme_authjs_config, readme_upstash_ratelimit [EXTRACTED 1.00]
- **Web manifest and icon declaration publishing flow** — public_icons_web_readme_manifest_setup, public_icons_web_readme_icon_declarations, public_icons_web_readme_starturl_scope [EXTRACTED 1.00]
- **Multi-platform app icon delivery** — public_icons_android_readme_launcher_res, public_icons_ios_readme_appiconset, public_icons_macos_readme_appicon_icns [INFERRED 0.75]

## Communities (63 total, 8 thin omitted)

### Community 0 - "Reminders and Statements"
Cohesion: 0.06
Nodes (60): LoginPage(), onSubmit(), CardPayReminders(), dismiss(), loadDismissed(), cardLabel(), CreditStatements(), FilterPill() (+52 more)

### Community 1 - "Pairing and Settings UI"
Cohesion: 0.06
Nodes (51): AjustesPage(), metadata, geistMono, geistSans, metadata, RootLayout(), viewport, AjustesClient() (+43 more)

### Community 2 - "Expense Sharing Inputs"
Cohesion: 0.09
Nodes (49): PrepayForm(), submit(), lineRemaining(), pick(), submit(), AccountSchema, cleanExternal(), createTransaction() (+41 more)

### Community 3 - "Category and Companion Management"
Cohesion: 0.11
Nodes (36): AddFab(), CategoryEditData, CategoryBadge(), CategoryManager(), CompanionEditData, CompanionManager(), lastUsedLabel(), MEMBER_COLORS (+28 more)

### Community 4 - "List Management Pages"
Cohesion: 0.09
Nodes (35): GET(), GET(), dynamic, ListasPage(), metadata, onSubmit(), ListasClient(), onSubmit() (+27 more)

### Community 5 - "App Shell and Forms"
Cohesion: 0.16
Nodes (17): ContainerId, CompanionForm(), GroupMemberRow, PasswordInput(), ConfirmTarget, PayLine, AVATAR_COLORS, ICON_COMPONENTS (+9 more)

### Community 6 - "Bank Brand Icons"
Cohesion: 0.09
Nodes (41): Afirme(), Amex(), Aplazo(), Banamex(), BanBajio(), BancoAzteca(), BanCoppel(), Banorte() (+33 more)

### Community 7 - "Accounts and Statements"
Cohesion: 0.16
Nodes (30): GET(), ActividadPage(), metadata, CuentasPage(), metadata, metadata, ResumenPage(), AccountKind (+22 more)

### Community 8 - "Runtime Dependencies"
Cohesion: 0.05
Nodes (38): dependencies, bcryptjs@^3.0.3, clsx@^2.1.1, dexie@^4.4.6, dexie-react-hooks@^4.4.0, @dnd-kit/utilities@^3.2.2, lucide-react@^1.47.0, next@16.4.3 (+30 more)

### Community 9 - "Subscriptions Management"
Cohesion: 0.15
Nodes (33): handleSwipe(), DueSubscriptions(), confirm(), skip(), submit(), SubscriptionHistorySheet(), run(), authedUser() (+25 more)

### Community 10 - "MSI Statements Engine"
Cohesion: 0.15
Nodes (28): MsiItemView, MsiPaymentsView, getMsiConcentrado(), activePeriods(), buildStatements(), cap(), currentPayablePeriod(), daysInMonth() (+20 more)

### Community 11 - "Month State and Summaries"
Cohesion: 0.13
Nodes (25): dynamic, MesesPage(), metadata, Computed, computeItem(), fmtFull(), fmtShort(), MONTH_PILL (+17 more)

### Community 12 - "Dev Dependencies"
Cohesion: 0.10
Nodes (28): devDependencies, prettier@^3.8.0, prettier-plugin-tailwindcss@^0.7.4, tailwindcss@^4, @tailwindcss/postcss@^4, @trivago/prettier-plugin-sort-imports@^6.0.2, tsx@^4.23.15, @types/bcryptjs@^2.4.6 (+20 more)

### Community 13 - "Group and Auth Pages"
Cohesion: 0.12
Nodes (19): CategoriasPage(), dynamic, metadata, GrupoIntegrantesPage(), GrupoPage(), auth, handlers, LoginSchema (+11 more)

### Community 14 - "Account Cards and Forms"
Cohesion: 0.16
Nodes (25): AccountCard(), AccountRow, AccountEditData, AccountForm(), onSubmit(), pickBank(), isLightColor(), maskExpiry() (+17 more)

### Community 15 - "Offline Sync Engine"
Cohesion: 0.12
Nodes (22): handleSignOut(), handleSync(), clearLocalData(), SNAPSHOT_VERSION, drainOutbox(), EnqueueInput, enqueueOfflineCreate(), hasOrphanEchoes() (+14 more)

### Community 16 - "Transaction Entry and Outbox"
Cohesion: 0.15
Nodes (22): FabProps, TxFab(), OfflineBadge(), FailedOpCard(), discard(), retry(), parsePayload(), PendingOutboxBanner() (+14 more)

### Community 17 - "Group Expenses and Settlement"
Cohesion: 0.16
Nodes (26): submit(), checkCategory(), closeGroup(), createGroup(), createGroupExpense(), dedupeNames(), deleteGroup(), ExpensePart (+18 more)

### Community 18 - "Group Join and Invites"
Cohesion: 0.11
Nodes (22): GroupJoinSheet(), join(), lookup(), claimSeat(), joinGroupAsNew(), previewGroup(), normalizeCode(), backend() (+14 more)

### Community 19 - "Transaction Form Controls"
Cohesion: 0.11
Nodes (17): EXPENSE_KINDS, SubEditData, fmtAmount(), lastCompanionUse(), Mode, MODE_TYPE, ModeDropdown(), MSI_OPTS (+9 more)

### Community 20 - "Account Sheets and Reorder"
Cohesion: 0.13
Nodes (24): AccountIcon(), AccountMoneySheet(), submit(), AccountsReorder(), containerOf(), onDragEnd(), onDragOver(), save() (+16 more)

### Community 21 - "Payment Confirmation Flow"
Cohesion: 0.18
Nodes (23): cancel(), confirm(), submit(), TxSchema, createCreditorIncome(), lineRemaining(), syncSubscriptionCheck(), TxDb (+15 more)

### Community 22 - "Activity Chart and Filters"
Cohesion: 0.12
Nodes (19): ActivityChart(), Bucket, ActivityClient(), dayKey(), FilterPill(), keyOf(), KINDS, Options() (+11 more)

### Community 23 - "Pending Charges and Debts"
Cohesion: 0.17
Nodes (23): MyPendingItem, CuentasShell(), Props, SubRow, LineSums, GroupSummary, derivePartnerMonths(), monthLabelOf() (+15 more)

### Community 24 - "Category Management API"
Cohesion: 0.18
Nodes (18): CategoryForm(), onSubmit(), KINDS, remove(), CreatedCategory, NewCategoryFields(), iconButton(), save() (+10 more)

### Community 25 - "Offline Data Models"
Cohesion: 0.16
Nodes (19): CardPayCandidate, DB_NAME, DB_VERSION, OfflineAccount, OfflineCategory, OfflineCharge, OfflineCompanion, OfflineDebtPayment (+11 more)

### Community 26 - "Debts and Cards UI"
Cohesion: 0.21
Nodes (17): CuentasClient(), DebtCard(), DebtDetail(), debtKey(), DebtSwipeRow(), Empty(), fmtShort(), GroupCard() (+9 more)

### Community 27 - "Android App Icons"
Cohesion: 0.10
Nodes (21): App icon - white elephant holding yellow dollar coin with receipt on purple background, App icon - white elephant holding yellow dollar coin with receipt on purple background, App icon - white elephant holding yellow dollar coin with receipt on purple background, App icon - white elephant holding yellow dollar coin with receipt on purple background, App icon - white elephant holding yellow dollar coin with receipt on purple background, App icon - white elephant holding yellow dollar coin with receipt on purple background, App icon - white elephant holding yellow dollar coin with receipt on purple background, App icon - white elephant holding yellow dollar coin with receipt on purple background (+13 more)

### Community 28 - "Bottom Sheets and Gestures"
Cohesion: 0.16
Nodes (14): BottomSheet(), endDrag(), onHandlePointerUp(), scrollFieldIntoView(), PaymentSheet(), reject(), PendingPaymentsBanner(), ensureWired() (+6 more)

### Community 29 - "Group Settlement Math"
Cohesion: 0.22
Nodes (18): submit(), computeGroupNets(), computeGroupOutstandingCents(), GROUP_REOPEN_GRACE_MS, groupClosedTime(), groupReopenable(), round2(), SeatNet (+10 more)

### Community 30 - "iOS App Icons"
Cohesion: 0.11
Nodes (19): iOS App Icon 20@1x - White Elephant Holding Yellow Dollar Coin with Receipt on Purple Background, iOS App Icon 20@2x - White Elephant Holding Yellow Dollar Coin with Receipt on Purple Background, iOS App Icon 20@3x - White Elephant Holding Yellow Dollar Coin with Receipt on Purple Background, iOS App Icon 29@1x - White Elephant Holding Yellow Dollar Coin with Receipt on Purple Background, iOS App Icon 29@2x - White Elephant Holding Yellow Dollar Coin with Receipt on Purple Background, iOS App Icon 29@3x - White Elephant Holding Yellow Dollar Coin with Receipt on Purple Background, iOS App Icon 40@1x - White Elephant Holding Yellow Dollar Coin with Receipt on Purple Background, iOS App Icon 40@2x - White Elephant Holding Yellow Dollar Coin with Receipt on Purple Background (+11 more)

### Community 31 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 32 - "Confirmation and Pairing Items"
Cohesion: 0.25
Nodes (16): ActividadShell(), Props, MonthOpt, SourceConfirmItem, ToConfirmItem, ExpiryAccount, PairingBanner(), toAccountOptions() (+8 more)

### Community 33 - "Category Catalog"
Cohesion: 0.18
Nodes (14): CatalogRow, findCategory(), ACCOUNT_COLORS, cap(), CatInfo, CatKind, CustomCat, Def (+6 more)

### Community 34 - "Monthly Summary Views"
Cohesion: 0.29
Nodes (14): CreditStatementView, ResumenInvolvedTx, ResumenMineTx, Props, ResumenShell(), deriveMonths(), toCatalog(), deriveStatements() (+6 more)

### Community 35 - "App Layout and Navigation"
Cohesion: 0.25
Nodes (12): AppLayout(), BottomNav(), ITEMS, Fab(), ScrollTopButton(), emit(), getServerSnapshot(), getSnapshot() (+4 more)

### Community 36 - "UI Component Config"
Cohesion: 0.13
Nodes (14): aliases, components, ui, utils, iconLibrary, rsc, $schema, style (+6 more)

### Community 37 - "Group Detail Actions"
Cohesion: 0.18
Nodes (11): GroupDetailClient(), cancelRow(), confirmClaim(), doDeleteExpense(), refresh(), runMenuAction(), MyPendingRow(), cancel() (+3 more)

### Community 38 - "NPM Scripts"
Cohesion: 0.13
Nodes (15): scripts, build, db:migrate, db:push, db:seed, db:seed:test, db:seed:test:clean, db:studio (+7 more)

### Community 39 - "Transaction Rows and Lists"
Cohesion: 0.31
Nodes (11): fmtFull(), Row(), TransactionDetail(), typeLabel(), TransactionList(), TransactionRow(), TxRow, Badge() (+3 more)

### Community 40 - "Prisma Seed and Config"
Cohesion: 0.15
Nodes (8): @prisma/adapter-pg@^7.10.0, dotenv@^18.0.3, prisma@^7.10.0, adapter, prisma, dotenv, prisma, @prisma/adapter-pg

### Community 41 - "Filter State Stores"
Cohesion: 0.22
Nodes (11): ActivityFiltersState, ActivityKind, ActivityRange, currentMonthKey(), useActivityFilters, currentMonthKey(), ResumenFiltersState, StatementFiltersState (+3 more)

### Community 42 - "Group Members Management"
Cohesion: 0.33
Nodes (10): GroupMembersClient(), refresh(), remove(), saveEdit(), submit(), addGroupSeat(), cleanName(), groupHasExpenses() (+2 more)

### Community 43 - "Swipe Gestures and History"
Cohesion: 0.27
Nodes (7): HistoryStrip(), shareLine(), SubFront(), SubscriptionSwipeRow(), SwipeRow(), close(), onClickCapture()

### Community 44 - "Account Detail Views"
Cohesion: 0.33
Nodes (8): AccountDetail(), toggleFavorite(), CardVisual(), isLightColor(), RecentRow(), Row(), setFavoriteAccount(), BankIcon

### Community 45 - "macOS App Icons"
Cohesion: 0.20
Nodes (10): macOS App Icon - white elephant holding yellow dollar coin with receipt on purple rounded square, macOS App Icon - white elephant holding yellow dollar coin with receipt on purple rounded square, macOS App Icon - white elephant holding yellow dollar coin with receipt on purple rounded square, macOS App Icon - white elephant holding yellow dollar coin with receipt on purple rounded square, macOS App Icon - white elephant holding yellow dollar coin with receipt on purple rounded square, macOS App Icon - white elephant holding yellow dollar coin with receipt on purple rounded square, macOS App Icon - white elephant holding yellow dollar coin with receipt on purple rounded square, macOS App Icon - white elephant holding yellow dollar coin with receipt on purple rounded square (+2 more)

### Community 46 - "Group Creation Flow"
Cohesion: 0.22
Nodes (5): CuentasSpeedDial(), cleanSeatName(), GroupCreateSheet(), addSeat(), submit()

### Community 47 - "UI Utility Dependencies"
Cohesion: 0.14
Nodes (9): class-variance-authority@^0.7.1, @dnd-kit/sortable@^10.0.0, @radix-ui/react-slot@^1.3.3, overrides, deepmerge-ts, mysql2, class-variance-authority, @dnd-kit/sortable (+1 more)

### Community 48 - "Project Bootstrap Docs"
Cohesion: 0.25
Nodes (7): generate-agent-files Script, Next.js Docs Guide in node_modules/next/dist/docs, AGENTS.md Reference, app/page.tsx Editable Page, Development Server Workflow, next/font Geist Optimization, Next.js Project Bootstrap with create-next-app

### Community 49 - "Household Pairing Utils"
Cohesion: 0.36
Nodes (5): getCoupleOf(), getPartnerId(), MyGroup, newPairCode(), randomSuffix()

### Community 50 - "Native Icon Integration"
Cohesion: 0.29
Nodes (6): Android Launcher res Directory, AndroidManifest Icon Declaration, 512px Play Store PNG, AppIcon.appiconset, 1024px Universal Image, Xcode Assets Catalog Integration

### Community 51 - "Web PWA Icons"
Cohesion: 0.29
Nodes (7): Android Chrome Icon 192x192, Android Chrome Icon 512x512 (Canonical PWA Icon), Apple Touch Icon, Favicon 16x16, Favicon 32x32, Maskable Icon 512, OG Social Share Image

### Community 52 - "Deployment and Env Config"
Cohesion: 0.29
Nodes (6): Auth.js AUTH_SECRET and AUTH_URL, DATABASE_URL Neon Database, Environment Variables Configuration, Upstash Redis Rate Limit, Prisma Migrate Deploy on Vercel Build, Vercel Platform Deployment

### Community 53 - "ESLint Config"
Cohesion: 0.33
Nodes (5): eslintConfig, eslint@^9, eslint-config-next@16.4.3, eslint, eslint-config-next

### Community 54 - "Web Manifest Setup"
Cohesion: 0.50
Nodes (3): Icon Link Declarations, Web Manifest Setup with site.webmanifest, start_url and scope Configuration

## Knowledge Gaps
- **68 isolated node(s):** `{ GET, POST }`, `Next.js Docs Guide in node_modules/next/dist/docs`, `generate-agent-files Script`, `AGENTS.md Reference`, `app/page.tsx Editable Page` (+63 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 321 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `App Shell and Forms` to `Reminders and Statements`, `Pairing and Settings UI`, `Expense Sharing Inputs`, `Category and Companion Management`, `List Management Pages`, `Accounts and Statements`, `Runtime Dependencies`, `Subscriptions Management`, `Month State and Summaries`, `Dev Dependencies`, `Group and Auth Pages`, `Account Cards and Forms`, `Transaction Entry and Outbox`, `Group Expenses and Settlement`, `Account Sheets and Reorder`, `Payment Confirmation Flow`, `Activity Chart and Filters`, `Category Management API`, `Debts and Cards UI`, `Bottom Sheets and Gestures`, `Group Settlement Math`, `App Layout and Navigation`, `Account Detail Views`, `Legacy Places Page`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **What connects `{ GET, POST }`, `Next.js Docs Guide in node_modules/next/dist/docs`, `generate-agent-files Script` to the rest of the system?**
  _68 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Reminders and Statements` be split into smaller, more focused modules?**
  _Cohesion score 0.06468797564687975 - nodes in this community are weakly interconnected._
- **Why does `react` connect `App Shell and Forms` to `Reminders and Statements`, `Pairing and Settings UI`, `Category and Companion Management`, `List Management Pages`, `Bank Brand Icons`, `Runtime Dependencies`, `Subscriptions Management`, `Month State and Summaries`, `Dev Dependencies`, `Account Cards and Forms`, `Transaction Entry and Outbox`, `Transaction Form Controls`, `Account Sheets and Reorder`, `Activity Chart and Filters`, `Category Management API`, `Debts and Cards UI`, `Bottom Sheets and Gestures`, `App Layout and Navigation`, `Transaction Rows and Lists`, `Account Detail Views`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Should `Pairing and Settings UI` be split into smaller, more focused modules?**
  _Cohesion score 0.062004662004662 - nodes in this community are weakly interconnected._
- **Why does `cn()` connect `Account Sheets and Reorder` to `Reminders and Statements`, `Pairing and Settings UI`, `Category and Companion Management`, `List Management Pages`, `App Shell and Forms`, `Subscriptions Management`, `Month State and Summaries`, `Account Cards and Forms`, `Transaction Entry and Outbox`, `Group Join and Invites`, `Transaction Form Controls`, `Category Management API`, `Debts and Cards UI`, `Bottom Sheets and Gestures`, `Confirmation and Pairing Items`, `App Layout and Navigation`, `Group Detail Actions`, `Transaction Rows and Lists`, `Group Members Management`, `Swipe Gestures and History`, `Group Creation Flow`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Should `Expense Sharing Inputs` be split into smaller, more focused modules?**
  _Cohesion score 0.0936026936026936 - nodes in this community are weakly interconnected._