# Graph Report - Wizards  (2026-05-12)

## Corpus Check
- 373 files · ~371,694 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2768 nodes · 8354 edges · 106 communities (98 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 35 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d005a31c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]

## God Nodes (most connected - your core abstractions)
1. `useI18n()` - 174 edges
2. `jsonError()` - 138 edges
3. `requireApiUserId()` - 120 edges
4. `enforceApiRateLimit()` - 102 edges
5. `VoiceProvider()` - 88 edges
6. `cn()` - 66 edges
7. `LocaleProvider()` - 60 edges
8. `parseJsonBody()` - 58 edges
9. `SettingsPanelKey` - 55 edges
10. `FriendsView()` - 53 edges

## Surprising Connections (you probably didn't know these)
- `useI18n()` --calls--> `MessageAttachment`  [EXTRACTED]
  apps/web/src/components/providers/locale-provider.tsx → packages/types/src/messages.ts
- `main()` --calls--> `assertSeedIsAllowed()`  [EXTRACTED]
  apps/desktop/src-tauri/src/main.rs → packages/db/src/seed.ts
- `main()` --calls--> `ensureUser()`  [EXTRACTED]
  apps/desktop/src-tauri/src/main.rs → packages/db/src/seed.ts
- `main()` --calls--> `ensureRole()`  [EXTRACTED]
  apps/desktop/src-tauri/src/main.rs → packages/db/src/seed.ts
- `main()` --calls--> `ensureServerMember()`  [EXTRACTED]
  apps/desktop/src-tauri/src/main.rs → packages/db/src/seed.ts

## Communities (106 total, 8 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (91): createDMConversationRequest(), CreateDMBody, CreateDMBodySchema, DMConversationsPageResponseSchema, DMConversationsQuery, DMConversationsQuerySchema, DMConversationsResponseSchema, DMErrorCode (+83 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (58): POST(), requireApiUserId(), POST(), RouteContext, DELETE(), PATCH(), RouteContext, DELETE() (+50 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (57): AdminAccessUser, AdminDashboard(), AdminDashboardProps, formatBytes(), formatDateTime(), formatDuration(), formatNumber(), MetricCard() (+49 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (56): NotificationComposer(), NotificationComposerProps, RequestState, SegmentType, requestJson(), ServerFeatureToggle(), ServerFeatureToggleProps, DELETED_NOTICE_OPTIONS (+48 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (53): LegacyAppearanceSettingsPage(), buildVerificationUrl(), EmailVerificationError, EmailVerificationErrorCode, EmailVerificationResult, EmailVerificationUser, escapeHtml(), GeneratedEmailVerificationToken (+45 more)

### Community 5 - "Community 5"
Cohesion: 0.03
Nodes (62): AddServerMemberInput, AddServerMemberSchema, CreateCategoryInput, CreateCategorySchema, CreateChannelInput, CreateChannelSchema, CreateInviteInput, CreateInviteSchema (+54 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (38): ChannelConversationPage(), ChannelConversationPageProps, ChatArea(), ChatAreaProps, FloatingPanelPosition, getStatusKey(), PendingMessagePayload, ClearChannelHistoryAction() (+30 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (48): applyRemoteAudioState(), buildAudioCaptureOptions(), collectScreenShares(), connectLiveKitRoomWithRetry(), countActiveScreenShares(), createLocalVoiceAudioLevelMonitor(), E2E_CAMERA_TRACK, getAudioCaptureRestartSignature() (+40 more)

### Community 8 - "Community 8"
Cohesion: 0.1
Nodes (56): getSocketServer(), invalidateServerPermissionCache(), deriveWorkspaceAccessLevel(), permissionKeysToMask(), permissionMaskToKeys(), applyChannelPermissionMutation(), ChannelPermissionOverrideRecord, ChannelPermissionRoleRecord (+48 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (37): logoutAction(), normalizeIdleTimeoutMinutes(), PRESENCE_IDLE_TIMEOUT_OPTIONS, PresenceSocket, PresenceStatus, readStoredIdleTimeoutMinutes(), usePresenceActivity(), usePresenceIdleTimeoutPreference() (+29 more)

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (52): dmAttachmentSelect, dmAuthorSelect, dmConversationInclude, DMMessageNode, dmParticipantUserSelect, DMReactionRow, dmReplyInclude, DMThreadSummaryRow (+44 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (37): AUDIENCE_SELECTOR_OPTIONS, AudienceSelector(), AudienceSelectorOption, AudienceSelectorProps, AudienceSelectorValue, AUDIENCE_ICON_CLASS, AUDIENCES, AudienceTone (+29 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (36): GET(), getBootstrapAdminEmails(), getOrCreateBootstrapRole(), isAllowedRole(), RequireAdminOptions, requireAdminUser(), AdminLayout(), requireAdminOrRedirect() (+28 more)

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (36): applyDMConversationPresenceUpdateToPageData(), applyDMConversationUpdate(), applyDMConversationUpdateToPageData(), createDMConversationsInfiniteData(), DMClientError, DMConversationsInfiniteData, dmQueryKeys, fetchDMConversation() (+28 more)

### Community 14 - "Community 14"
Cohesion: 0.05
Nodes (45): DMMessagesResponse, ChatMessage, ChatMessageSchema, ChatMessageType, ChatMessageTypeSchema, EditMessageInput, EditMessageInputSchema, MessageAttachmentSchema (+37 more)

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (42): AccountSettingsState, UpdateAccountSettingsResult, APP_ICON_OPTIONS, AppIconId, WhisprReleaseNote, NOTIFICATION_LIMIT_OPTIONS, SoundEffectsProvider(), SoundEffectsProviderProps (+34 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (38): isMissingUserSettingsThemeColumn(), ThemeActionResult, updateThemePreferenceAction(), AuthLayout(), ADVANCED_WIZARDS_THEMES, clampChannelSidebarWidth(), clampNotificationLimit(), clampServerRailWidth() (+30 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (41): createOrOpenDirectMessage(), findDirectConversation(), getDMDisplayName(), areFriends(), getBlockStatus(), getFriendship(), haveMutualFriends(), haveMutualServers() (+33 more)

### Community 18 - "Community 18"
Cohesion: 0.11
Nodes (40): endAllMediaUsageSessionsForVoiceSession(), startMediaUsageSession(), GET(), withTimeout(), createRedisClient(), getRedis(), getRedisOptions(), getRedisSub() (+32 more)

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (34): user, normalizeUsername(), TURKISH_USERNAME_TRANSLITERATION, adapter, baseAdapter, canOAuthUserSignIn(), ForgotPasswordInput, ForgotPasswordSchema (+26 more)

### Community 20 - "Community 20"
Cohesion: 0.08
Nodes (37): isAppIconId(), clampExpandedServerRailWidth(), clampMainPanelWidth(), clampNotificationPopupTimeoutSeconds(), clampServerRailIconSize(), applyMessageFontToDocument(), getMessageFontFamily(), isMessageFontId() (+29 more)

### Community 21 - "Community 21"
Cohesion: 0.05
Nodes (39): Auth Helpers, CI Integration, code:bash (E2E_TEST_MODE=true), code:bash (PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm --filter @wizards/web e2e:), code:bash (pnpm --filter @wizards/db exec prisma db push --schema prism), code:bash (pnpm --filter @wizards/web exec playwright install chromium), code:bash (pnpm --filter @wizards/web e2e:smoke), code:bash (pnpm --filter @wizards/web e2e:headed) (+31 more)

### Community 22 - "Community 22"
Cohesion: 0.11
Nodes (22): assertActiveApiUser(), AuthAccessUser, isActiveAuthUser(), assertAttachmentAccess(), assertDownloadableUrl(), contentDispositionFor(), GET(), RouteContext (+14 more)

### Community 23 - "Community 23"
Cohesion: 0.1
Nodes (38): recordMessageCreated(), createEmptyThreadSummary(), dmMessageInclude, groupDMReactions(), mapDMReply(), setDMReaction(), toggleDMReaction(), validateDMReactionEmoji() (+30 more)

### Community 24 - "Community 24"
Cohesion: 0.11
Nodes (29): CONTRIBUTOR_NAMES, CORRUPTED_CONTRIBUTOR_NAMES, configured_app_url(), dispatch_desktop_command(), handle_desktop_deep_links(), is_allowed_oauth_navigation(), is_oauth_navigation_active(), is_safe_internal_desktop_path() (+21 more)

### Community 25 - "Community 25"
Cohesion: 0.13
Nodes (25): MessageEditorProps, getDeletedMessageLabel(), listDirectMessages(), APP_LOCALES, APP_MESSAGES, AppLocale, detectBrowserLocale(), normalizeAppLocale() (+17 more)

### Community 26 - "Community 26"
Cohesion: 0.1
Nodes (29): VoiceCameraStatus, VoiceParticipantViewModel, VoiceScreenShareViewModel, CameraStatusPill(), getAvatarGlowStyle(), getParticipantGridClass(), getParticipantGridStyle(), getSpeakingClass() (+21 more)

### Community 27 - "Community 27"
Cohesion: 0.16
Nodes (32): addWorkspaceServerMemberByUsername(), canAddMembers(), ensureUserNotServerBanned(), joinWorkspaceServerByInvite(), listWorkspaceServers(), ChannelUnreadCountRow, createUserCountMap(), emitServerUnreadUpdatesForServer() (+24 more)

### Community 28 - "Community 28"
Cohesion: 0.14
Nodes (32): ChannelPage(), hasAdminAccess(), readCachedChannelPermissionSnapshot(), writeCachedChannelPermissionSnapshot(), assertCachedChannelPermission(), canUseCachedLockedChannelPermission(), channelOverrideSelect, createChannelPermissionSnapshot() (+24 more)

### Community 29 - "Community 29"
Cohesion: 0.11
Nodes (30): dmNotificationUserSelect, ALLOWED_PUBLISH_SOURCES, createLiveKitToken(), ensureLiveKitEnv(), getLiveKitCredentials(), getLiveKitServiceUrl(), getLiveKitUrl(), loadEnvFallback() (+22 more)

### Community 30 - "Community 30"
Cohesion: 0.15
Nodes (30): recordPermissionCacheMetric(), channelPermissionSnapshotKey(), getReadyRedis(), getRevisions(), hydrateSnapshot(), invalidateMemberPermissionCache(), isPermissionCacheEnabled(), memberVersionKey() (+22 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (23): DesktopDiagnosticsPanel(), DiagnosticTone, AudioDeviceKind, AudioDeviceOption, AudioDevicesState, canEnumerateDevices(), canSelectAudioOutput(), useAudioDevices() (+15 more)

### Community 32 - "Community 32"
Cohesion: 0.13
Nodes (28): getResultPreview(), getSearchPanelPosition(), MessageSearchPanel(), MessageSearchPanelProps, SearchMode, SearchPanelPosition, toIsoDateTime(), messageSearchQueryKeys (+20 more)

### Community 33 - "Community 33"
Cohesion: 0.12
Nodes (26): parseSocketPayload(), SocketConversationPayloadSchema, SocketDMMessageSendPayloadSchema, SocketDMScreenShareTargetPayloadSchema, SocketIdSchema, SocketMessageDeletePayloadSchema, SocketMessageEditPayloadSchema, SocketMessageReactionPayloadSchema (+18 more)

### Community 34 - "Community 34"
Cohesion: 0.11
Nodes (25): useAppearanceHydration(), readStoredNotificationAutoClose(), useAppStore, MessageFontSync(), ChannelSidebar(), EmptyChannelState(), MainChannelPanel(), MainChannelPanelProps (+17 more)

### Community 35 - "Community 35"
Cohesion: 0.11
Nodes (27): applyVoiceProfileUpdate(), applyVoiceScreenShareUpdate(), applyVoiceStateUpdate(), useVoiceStates(), UserProfileUpdatedPayload, deleteVoiceState(), fetchVoiceStates(), requestJson() (+19 more)

### Community 36 - "Community 36"
Cohesion: 0.11
Nodes (23): GET(), DELETE(), GET(), RouteContext, GET(), getDirectMessageConversationForUser(), getDMReactionMap(), getDMThreadSummaryMap() (+15 more)

### Community 37 - "Community 37"
Cohesion: 0.1
Nodes (25): DIRECT_DATABASE_PROTOCOLS, ensurePrismaClientRuntime(), findGeneratedClientIndexPath(), hasNativeEngineArtifact(), isDirectDatabaseUrl(), isPrismaProxyUrl(), loadEnvFile(), loadWorkspaceEnv() (+17 more)

### Community 38 - "Community 38"
Cohesion: 0.12
Nodes (15): test, loginAs(), expectVoiceParticipantCount(), getE2EServerRoute(), openLoggedInPage(), bobMessage, LoggedInPage, openLoggedInPage() (+7 more)

### Community 39 - "Community 39"
Cohesion: 0.12
Nodes (21): loginAction(), PrimaryButton(), SocialAuthButtons(), TextInput, LoginCard(), LoginPage(), getLoginRoleHint(), LoginRole (+13 more)

### Community 40 - "Community 40"
Cohesion: 0.17
Nodes (25): POST(), e2eServer, E2EUserKey, e2eUsers, getE2EUserByKey(), blockUser(), findE2EUserId(), DELETE() (+17 more)

### Community 41 - "Community 41"
Cohesion: 0.11
Nodes (25): getConversationPreview(), getMessageAttachmentMaxBytes(), isMessageAttachmentFilenameAllowed(), isMessageFileContentType(), isMessageGifContentType(), isMessageImageContentType(), isMessageVideoContentType(), isSupportedMessageAttachmentContentType() (+17 more)

### Community 42 - "Community 42"
Cohesion: 0.09
Nodes (17): extractFirstUrl(), fetchPreview(), LinkPreviewCard(), MessageEditor(), clampPollDuration(), formatPollRemainingTime(), MessageItemProps, ParsedPoll (+9 more)

### Community 43 - "Community 43"
Cohesion: 0.15
Nodes (19): DMScreenSharePanel(), IncomingDMScreenShareModal(), ScreenShareVideo(), toggleElementFullscreen(), Button, ButtonProps, buttonVariants, ActiveDMScreenShare (+11 more)

### Community 44 - "Community 44"
Cohesion: 0.1
Nodes (20): headers, authBodyFont, authDisplayFont, bodyFont, displayFont, messageInterFont, messageJetBrainsMonoFont, messageOpenSansFont (+12 more)

### Community 45 - "Community 45"
Cohesion: 0.17
Nodes (20): writeAdminAuditLog(), CampaignSegmentSchema, NotificationCampaignCreateRequestSchema, NotificationCampaignPreviewRequestSchema, toCreateCampaignInput(), CampaignSegment, CreateCampaignInput, createNotificationCampaign() (+12 more)

### Community 46 - "Community 46"
Cohesion: 0.13
Nodes (17): markDirectMessageRead(), PATCH(), assertChannelAccess(), GET(), mapSettingsToLevel(), PATCH(), RouteContext, GET() (+9 more)

### Community 47 - "Community 47"
Cohesion: 0.21
Nodes (23): AccountSettingsField, broadcastUserProfileUpdate(), isTrustedAvatarUrl(), mapUserToAccountState(), mapVisiblePresenceStatus(), updateAccountAvatarAction(), UpdateAccountAvatarResult, UpdateAccountAvatarSchema (+15 more)

### Community 48 - "Community 48"
Cohesion: 0.16
Nodes (22): createMessageSendFanoutMetrics(), createPermissionCacheMetrics(), createUnreadFanoutMetrics(), flushWorkspacePerformanceMetrics(), flushWorkspacePerformanceMetricsForTest(), getFlushIntervalMs(), hasMetricsToFlush(), isWorkspacePerformanceMetricsEnabled() (+14 more)

### Community 49 - "Community 49"
Cohesion: 0.11
Nodes (23): requireServerPermissionForUser(), ADMIN_ACCESS_PERMISSIONS, ALL_PERMISSION_VALUES, ALL_PERMISSIONS, applyOverride(), ChannelPermissionOverrideRecord, ChannelPermissionResolutionContext, combinePermissions() (+15 more)

### Community 50 - "Community 50"
Cohesion: 0.17
Nodes (17): checkPasswordResetRateLimit(), checkVerificationResendRateLimit(), registerAction(), sendVerificationEmailWithRateLimit(), ChannelError(), logError(), redactText(), redactValue() (+9 more)

### Community 51 - "Community 51"
Cohesion: 0.15
Nodes (19): E2EUploadOptions, E2EUploadResponse, readFileAsDataUrl(), uploadE2EFile(), useE2EUploadThing, AVATAR_CONTENT_TYPES, buildAvatarFallback(), clamp() (+11 more)

### Community 52 - "Community 52"
Cohesion: 0.17
Nodes (21): getStatusDotClass(), buildMemberGroups(), getGroupPreview(), getMemberRole(), getRoleColorStyle(), getRoleDisplay(), getRoleKind(), getRoleRank() (+13 more)

### Community 53 - "Community 53"
Cohesion: 0.12
Nodes (12): CameraDeviceOption, CameraDevicesState, canEnumerateDevices(), canPreviewCamera(), useCameraDevices(), E2EVoiceProvider(), useVoiceStore, VoiceCameraRotation (+4 more)

### Community 54 - "Community 54"
Cohesion: 0.19
Nodes (19): applyAppBadge(), BadgeNavigator, clampNotificationText(), DESKTOP_NOTIFICATION_TYPES, DesktopExperience(), getGenericNotificationBody(), getNotificationApi(), getNotificationBody() (+11 more)

### Community 55 - "Community 55"
Cohesion: 0.17
Nodes (15): clearE2EVoiceStates(), createIsolatedServerForMembershipTest(), E2EPrismaClient, getDMUnreadCount(), getE2EDMConversationId(), getE2EUserId(), getE2EUserPreferences(), getServerMemberId() (+7 more)

### Community 56 - "Community 56"
Cohesion: 0.14
Nodes (15): formatAttachmentSize(), getLightboxCursor(), getZoomLabel(), ImageLightbox(), ImageLightboxProps, PanOffset, PanStart, extensionFromFilename() (+7 more)

### Community 57 - "Community 57"
Cohesion: 0.1
Nodes (20): 1. PROJECT STRUCTURE AUDIT, 2. DATABASE SCHEMA AUDIT, 3. AUTHENTICATION AUDIT, 4. LAYOUT & UI AUDIT, 5. API ROUTES AUDIT, 6. DATA FETCHING & STATE AUDIT, 7. TYPESCRIPT & CODE QUALITY AUDIT, 8. PERFORMANCE & BEST PRACTICES AUDIT (+12 more)

### Community 58 - "Community 58"
Cohesion: 0.14
Nodes (12): EmojiPicker(), EmojiPickerProps, EmojiSelection, Picker, GifPicker(), GifPickerProps, GiphyAttachmentResponse, GiphyGif (+4 more)

### Community 59 - "Community 59"
Cohesion: 0.12
Nodes (15): messageByText(), addQuickReaction(), browserDialogs, composer, LoggedInPage, message, messageByText(), messageList (+7 more)

### Community 60 - "Community 60"
Cohesion: 0.11
Nodes (4): FloatCardProps, FloatCopy, FloatTone, TrustCopy

### Community 61 - "Community 61"
Cohesion: 0.15
Nodes (15): DEFAULT_VOICE_AUDIO_PREFERENCES, DEFAULT_VOICE_CAMERA_PREFERENCES, PersistedVoiceStoreState, sanitizeCameraPreferences(), sanitizeCameraRotation(), sanitizeScreenShareQuality(), VoiceAudioPreferences, VoiceCameraPreferences (+7 more)

### Community 62 - "Community 62"
Cohesion: 0.22
Nodes (12): SocketContext, SocketProvider(), getSocket(), getSocketUrl(), ClientToServerEvents, ServerToClientEvents, VoiceAudioLevelPayload, VoiceInviteErrorPayload (+4 more)

### Community 63 - "Community 63"
Cohesion: 0.15
Nodes (16): assertWebEnvironment(), EnvSource, EnvValidationResult, isBooleanFlag(), isPositiveInteger(), isPresent(), isValidUrl(), OPTIONAL_BOOLEAN_ENV_VARS (+8 more)

### Community 64 - "Community 64"
Cohesion: 0.25
Nodes (15): deleteAllNotifications(), fetchNotifications(), fetchUnreadCount(), markAllNotificationsRead(), markNotificationRead(), notificationsQueryKeys, requestJson(), RequestOptions (+7 more)

### Community 65 - "Community 65"
Cohesion: 0.32
Nodes (16): assertPublicHttpUrl(), cacheKey(), fetchLinkPreview(), isBlockedHostname(), isBlockedIP(), isPrivateIPv4(), isPrivateIPv6(), LinkPreview (+8 more)

### Community 66 - "Community 66"
Cohesion: 0.21
Nodes (13): DotGrid(), cloneDotGridTheme(), DARK_DOT_GRID_THEME, DotGridThemeValues, LIGHT_DOT_GRID_THEME, buildDots(), DotGridPoint, getGridSpacing() (+5 more)

### Community 67 - "Community 67"
Cohesion: 0.2
Nodes (10): API_RATE_LIMITS, ApiRateLimitAction, getApiRateLimitConfig(), requiredActions, GET(), RouteContext, SearchQuerySchema, DELETE() (+2 more)

### Community 68 - "Community 68"
Cohesion: 0.23
Nodes (15): mapDMParticipant(), readPresence(), listFriends(), isRecord(), normalizeNullableString(), normalizePresenceStatus(), parsePresencePayload(), parsePresenceRecord() (+7 more)

### Community 69 - "Community 69"
Cohesion: 0.24
Nodes (12): assertSafeE2EDatabase(), assertSafeE2ERedis(), createE2EPrismaClient(), E2E_CONTRIBUTOR_NAMES, FORBIDDEN_HOST_PARTS, getE2EDatabaseUrl(), resetAndSeedE2EData(), resetE2EData() (+4 more)

### Community 70 - "Community 70"
Cohesion: 0.18
Nodes (14): applyScreenShareQualityToTrack(), applyScreenShareEncodingToSender(), buildScreenShareMediaConstraints(), getScreenShareCaptureOptions(), getScreenSharePublishOptions(), getScreenShareQualityPreset(), H1080_FPS60_PRESET, H1440_FPS30_PRESET (+6 more)

### Community 71 - "Community 71"
Cohesion: 0.2
Nodes (9): SettingsLayout(), isAdvancedAppearancePanel(), PANELS_BY_SECTION, SettingsSection, SettingsSelection, NavItem, SettingsSidebar(), ThemeSessionSync() (+1 more)

### Community 72 - "Community 72"
Cohesion: 0.18
Nodes (8): AdminManagedServer, AdminManagedUser, AdminManagementPanel(), AdminManagementPanelProps, formatDuration(), formatNumber(), PaginatedResponse, UserAction

### Community 73 - "Community 73"
Cohesion: 0.15
Nodes (12): Build Commands, CI Plan, code:powershell (pnpm --filter @wizards/web typecheck), code:powershell ($env:TAURI_WEB_URL="https://app.your-whispr-domain.com"), code:text (apps/desktop/src-tauri/target/release/bundle/nsis/), macOS And Linux Readiness, Release Checklist, Scope (+4 more)

### Community 74 - "Community 74"
Cohesion: 0.17
Nodes (6): drawer, message, mobileViewports, popup, reactionPicker, toolbar

### Community 75 - "Community 75"
Cohesion: 0.2
Nodes (8): findScreenShareTrack(), parseParticipantMetadata(), UseDMScreenShareInput, getParticipantProfile(), isScreenSharePermissionDenied(), isScreenShareSupported(), parseParticipantMetadata(), fetchLiveKitToken()

### Community 76 - "Community 76"
Cohesion: 0.17
Nodes (11): Auth And Session, Desktop Diagnostics, Install And Launch, Navigation, Notifications And Native UX, Realtime Messaging, Regression Pass, Settings And Shortcuts (+3 more)

### Community 77 - "Community 77"
Cohesion: 0.29
Nodes (8): assertTurnstileHostnameAllowed(), getExpectedTurnstileHostnames(), getTurnstileErrorMessageKey(), getTurnstileSecret(), TurnstileErrorCode, TurnstileSiteVerifyResponse, TurnstileVerificationError, verifyTurnstileToken()

### Community 78 - "Community 78"
Cohesion: 0.25
Nodes (9): generateMetadata(), getLineKind(), isLegalDocumentId(), LEGAL_DOCUMENTS, LegalDocumentId, LegalDocumentPage(), LegalDocumentPageProps, readLegalDocument() (+1 more)

### Community 79 - "Community 79"
Cohesion: 0.18
Nodes (10): code:env (WORKSPACE_PERFORMANCE_METRICS=true), code:text ([workspace-performance]), code:env (WORKSPACE_PERFORMANCE_METRICS=false), code:env (PERMISSION_CACHE_DISABLED=true), Healthy UAT Shape, Log Signal, Rollback, UAT Env (+2 more)

### Community 80 - "Community 80"
Cohesion: 0.42
Nodes (7): assertSuccessfulE2EResponse(), expectLoggedIn(), expectLoggedOut(), loginViaUi(), logout(), logoutViaUi(), expectUserStatus()

### Community 81 - "Community 81"
Cohesion: 0.2
Nodes (9): Architecture, code:powershell (pnpm install), code:powershell (pnpm --filter @wizards/desktop dev), code:powershell ($env:TAURI_DEV_WEB_URL="http://localhost:3001"), code:powershell ($env:TAURI_WEB_URL="https://app.your-whispr-domain.com"), Desktop Shortcuts, Local Development, Production Build (+1 more)

### Community 82 - "Community 82"
Cohesion: 0.22
Nodes (6): nextConfig, packageJson, securityHeaders, whisprCommitId, whisprDeployId, whisprGeneratedBuildId

### Community 83 - "Community 83"
Cohesion: 0.28
Nodes (5): attachmentDraftByFilename(), lightbox, message, waitForReadyAttachmentDraft(), AttachmentDraft

### Community 84 - "Community 84"
Cohesion: 0.31
Nodes (6): LANGUAGE_OPTIONS, ThemeToggle(), getSystemTheme(), LoginTheme, readStoredTheme(), useLoginTheme()

### Community 85 - "Community 85"
Cohesion: 0.39
Nodes (6): AppUpdateNotifier(), fetchLatestVersion(), formatBuildId(), WHISPR_APP_VERSION, WHISPR_RELEASE_NOTES, WhisprVersionPayload

### Community 86 - "Community 86"
Cohesion: 0.25
Nodes (8): InterServerEvents, SocketData, AppSocketServer, getSocketRegistry(), GlobalSocketRegistry, setSocketServer(), getSocketAllowedOrigins(), initSocketServer()

### Community 87 - "Community 87"
Cohesion: 0.28
Nodes (5): CachedChannelPermissionSnapshot, setPermissionCacheRedisForTest(), MemoryRedis, restoreEnv(), withPermissionCacheEnabled()

### Community 88 - "Community 88"
Cohesion: 0.36
Nodes (7): ActiveVoiceReminder(), findVoiceChannel(), getRouteContext(), RouteContext, safeDecodePathSegment(), shouldShowVoiceReminder(), fetchWorkspaceServer()

### Community 89 - "Community 89"
Cohesion: 0.61
Nodes (6): getAppIconById(), AppIconProvider(), applyAppIcon(), applyAttributes(), ensureOwnedIconLink(), updateIconLink()

### Community 90 - "Community 90"
Cohesion: 0.25
Nodes (7): AsyncMethod, banDelegate, calls, channelDelegate, memberDelegate, serverDelegate, PermissionBits

### Community 91 - "Community 91"
Cohesion: 0.43
Nodes (5): getSafeAuthRedirectPath(), isSafeAuthRedirectPath(), SAFE_AUTH_REDIRECT_PREFIXES, LoginPage(), LoginPageProps

### Community 93 - "Community 93"
Cohesion: 0.38
Nodes (6): removeTurnstileWidget(), TurnstileApi, TurnstileWidget(), TurnstileWidgetProps, Window, Window

### Community 94 - "Community 94"
Cohesion: 0.6
Nodes (3): checkDMMessageRateLimits(), DM_MESSAGE_CONVERSATION_RATE_LIMIT, DM_MESSAGE_GLOBAL_RATE_LIMIT

### Community 95 - "Community 95"
Cohesion: 0.4
Nodes (4): compat, __dirname, eslintConfig, __filename

### Community 96 - "Community 96"
Cohesion: 0.67
Nodes (3): getToken(), ResetPasswordPage(), ResetPasswordPageProps

## Knowledge Gaps
- **620 isolated node(s):** `scriptPath`, `desktopRoot`, `generatedDir`, `generatedConfigPath`, `devUrl` (+615 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useI18n()` connect `Community 11` to `Community 0`, `Community 3`, `Community 4`, `Community 6`, `Community 7`, `Community 9`, `Community 15`, `Community 16`, `Community 17`, `Community 25`, `Community 26`, `Community 31`, `Community 32`, `Community 34`, `Community 39`, `Community 42`, `Community 43`, `Community 44`, `Community 50`, `Community 51`, `Community 52`, `Community 53`, `Community 54`, `Community 56`, `Community 58`, `Community 60`, `Community 62`, `Community 64`, `Community 65`, `Community 71`, `Community 75`, `Community 84`, `Community 85`, `Community 88`, `Community 93`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `WorkspaceChannel` connect `Community 5` to `Community 10`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `SettingsPanelKey` connect `Community 15` to `Community 64`, `Community 89`, `Community 34`, `Community 4`, `Community 71`, `Community 40`, `Community 11`, `Community 43`, `Community 13`, `Community 47`, `Community 16`, `Community 51`, `Community 20`, `Community 85`, `Community 22`, `Community 25`, `Community 31`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `scriptPath`, `desktopRoot`, `generatedDir` to the rest of the system?**
  _620 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._