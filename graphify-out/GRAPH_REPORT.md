# Graph Report - Wizards  (2026-05-14)

## Corpus Check
- 410 files · ~380,785 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3038 nodes · 9144 edges · 110 communities (103 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 39 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f60bf434`
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
- [[_COMMUNITY_Community 104|Community 104]]
- [[_COMMUNITY_Community 105|Community 105]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 107|Community 107]]

## God Nodes (most connected - your core abstractions)
1. `useI18n()` - 174 edges
2. `jsonError()` - 138 edges
3. `requireApiUserId()` - 120 edges
4. `enforceApiRateLimit()` - 112 edges
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

## Communities (110 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (86): assertActiveApiUser(), AuthAccessUser, requireApiUserId(), POST(), RouteContext, DELETE(), PATCH(), RouteContext (+78 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (75): GET(), createOrOpenDirectMessage(), dmAttachmentSelect, dmAuthorSelect, dmConversationInclude, DMMessageNode, dmParticipantUserSelect, DMReactionRow (+67 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (62): logoutAction(), getStatusDotClass(), useAppearanceHydration(), normalizeIdleTimeoutMinutes(), PRESENCE_IDLE_TIMEOUT_OPTIONS, PresenceSocket, PresenceStatus, readStoredIdleTimeoutMinutes() (+54 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (62): createDMConversationRequest(), actOnFriendRequestRequest(), applyFriendPresenceUpdate(), blockFriendRequest(), cancelFriendRequestRequest(), fetchBlockedFriends(), fetchFriends(), fetchPendingFriends() (+54 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (54): GET(), getBootstrapAdminEmails(), getOrCreateBootstrapRole(), isAllowedRole(), RequireAdminOptions, requireAdminUser(), writeAdminAuditLog(), AdminManagementPagination (+46 more)

### Community 5 - "Community 5"
Cohesion: 0.03
Nodes (62): AddServerMemberInput, AddServerMemberSchema, CreateCategoryInput, CreateCategorySchema, CreateChannelInput, CreateChannelSchema, CreateInviteInput, CreateInviteSchema (+54 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (54): ChannelConversationPage(), ChannelConversationPageProps, requestJson(), ServerFeatureToggle(), ServerFeatureToggleProps, DELETED_NOTICE_OPTIONS, ELEVATED_ROLE_KEYS, formatDeletedNoticeDuration() (+46 more)

### Community 7 - "Community 7"
Cohesion: 0.1
Nodes (57): POST(), assertE2EApiRouteEnabled(), CONFIGURED_E2E_URL_KEYS, E2ERouteEnv, isLocalE2EHost(), LOCAL_E2E_HOSTS, normalizeHostname(), e2eServer (+49 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (51): applyRemoteAudioState(), buildAudioCaptureOptions(), collectScreenShares(), connectLiveKitRoomWithRetry(), countActiveScreenShares(), createLocalVoiceAudioLevelMonitor(), E2E_CAMERA_TRACK, getAudioCaptureRestartSignature() (+43 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (48): LegacyAppearanceSettingsPage(), buildVerificationUrl(), EmailVerificationError, EmailVerificationErrorCode, EmailVerificationResult, EmailVerificationUser, escapeHtml(), GeneratedEmailVerificationToken (+40 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (33): ChatArea(), ChatAreaProps, FloatingPanelPosition, getStatusKey(), PendingMessagePayload, MessageInput(), MessageItem, MessageList() (+25 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (50): ChannelPage(), hasAdminAccess(), assertCachedChannelPermission(), canUseCachedLockedChannelPermission(), channelOverrideSelect, ChannelPermissionSnapshotChannel, createChannelPermissionSnapshot(), getChannelPermissionContext() (+42 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (42): DMScreenSharePanel(), IncomingDMScreenShareModal(), ScreenShareVideo(), toggleElementFullscreen(), ActiveDMScreenShare, IncomingDMScreenShare, useI18n(), VoiceCameraStatus (+34 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (38): registerChannelHandlers(), registerDMHandlers(), composeSocketHandlerRegistration(), registerSocketHandlers(), SocketHandlerRegistration, cleanup, cleanupCalls, cleanupStarted (+30 more)

### Community 14 - "Community 14"
Cohesion: 0.07
Nodes (37): formatAttachmentSize(), getLightboxCursor(), getZoomLabel(), ImageLightbox(), ImageLightboxProps, PanOffset, PanStart, extensionFromFilename() (+29 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (31): extractFirstUrl(), fetchPreview(), LinkPreviewCard(), MessageEditor(), MessageEditorProps, clampPollDuration(), formatPollRemainingTime(), MessageItemProps (+23 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (36): applyDMConversationPresenceUpdateToPageData(), applyDMConversationUpdate(), applyDMConversationUpdateToPageData(), createDMConversationsInfiniteData(), DMClientError, DMConversationsInfiniteData, dmQueryKeys, fetchDMConversation() (+28 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (37): logAnalyticsError(), isDMParticipant(), getDirectMessageConversationForUser(), getDMDisplayName(), mapConversationLastMessage(), mapDMConversationDTO(), mapDMMessagePayload(), mapDMMessagePayloadWithReactions() (+29 more)

### Community 18 - "Community 18"
Cohesion: 0.05
Nodes (45): DMMessagesResponse, ChatMessage, ChatMessageSchema, ChatMessageType, ChatMessageTypeSchema, EditMessageInput, EditMessageInputSchema, MessageAttachmentSchema (+37 more)

### Community 19 - "Community 19"
Cohesion: 0.1
Nodes (38): recordPermissionCacheMetric(), CachedChannelPermissionSnapshot, channelPermissionSnapshotKey(), getReadyRedis(), getRevisions(), hydrateSnapshot(), isPermissionCacheEnabled(), memberVersionKey() (+30 more)

### Community 20 - "Community 20"
Cohesion: 0.08
Nodes (27): AdminAccessUser, AdminDashboard(), AdminDashboardProps, formatBytes(), formatDateTime(), formatDuration(), formatNumber(), MetricCard() (+19 more)

### Community 21 - "Community 21"
Cohesion: 0.07
Nodes (38): isAppIconId(), clampExpandedServerRailWidth(), clampMainPanelWidth(), clampNotificationPopupTimeoutSeconds(), clampServerRailIconSize(), applyMessageFontToDocument(), getMessageFontFamily(), isMessageFontId() (+30 more)

### Community 22 - "Community 22"
Cohesion: 0.09
Nodes (40): assertUnblockedDMParticipants(), dmNotificationUserSelect, ALLOWED_PUBLISH_SOURCES, createLiveKitToken(), ensureLiveKitEnv(), getLiveKitCredentials(), getLiveKitRoomServiceClient(), getLiveKitServiceUrl() (+32 more)

### Community 23 - "Community 23"
Cohesion: 0.11
Nodes (32): isMissingUserSettingsThemeColumn(), ThemeActionResult, updateThemePreferenceAction(), ADVANCED_WIZARDS_THEMES, clampNotificationLimit(), getThemePreviewBackground(), LEGACY_THEME_ALIASES, normalizeWizardsThemeId() (+24 more)

### Community 24 - "Community 24"
Cohesion: 0.05
Nodes (39): Auth Helpers, CI Integration, code:bash (E2E_TEST_MODE=true), code:bash (PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm --filter @wizards/web e2e:), code:bash (pnpm --filter @wizards/db exec prisma db push --schema prism), code:bash (pnpm --filter @wizards/web exec playwright install chromium), code:bash (pnpm --filter @wizards/web e2e:smoke), code:bash (pnpm --filter @wizards/web e2e:headed) (+31 more)

### Community 25 - "Community 25"
Cohesion: 0.11
Nodes (35): assertPublicHttpUrl(), assertPublicResolvedAddresses(), cacheKey(), createPublicLookup(), fetchLinkPreview(), getHeader(), isBlockedHostname(), isBlockedIP() (+27 more)

### Community 26 - "Community 26"
Cohesion: 0.08
Nodes (26): PrimaryButton(), SecondaryButton(), SocialAuthButtons(), TextInput, LoginCard(), LoginPage(), getLoginRoleHint(), LoginRole (+18 more)

### Community 27 - "Community 27"
Cohesion: 0.11
Nodes (29): CONTRIBUTOR_NAMES, CORRUPTED_CONTRIBUTOR_NAMES, configured_app_url(), dispatch_desktop_command(), handle_desktop_deep_links(), is_allowed_oauth_navigation(), is_oauth_navigation_active(), is_safe_internal_desktop_path() (+21 more)

### Community 28 - "Community 28"
Cohesion: 0.08
Nodes (29): isActiveAuthUser(), normalizeUsername(), TURKISH_USERNAME_TRANSLITERATION, adapter, authorize(), baseAdapter, canOAuthUserSignIn(), ForgotPasswordInput (+21 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (26): ChannelError(), TypingIndicator(), TypingIndicatorProps, getDeletedMessageLabel(), createFriendAcceptedNotification(), createFriendRequestNotification(), getDisplayName(), APP_LOCALES (+18 more)

### Community 30 - "Community 30"
Cohesion: 0.12
Nodes (30): UpdateAccountSettingsResult, APP_ICON_OPTIONS, AppIconId, WhisprReleaseNote, NOTIFICATION_LIMIT_OPTIONS, fetchLayoutSettings(), patchLayoutSettings(), settingsQueryKeys (+22 more)

### Community 31 - "Community 31"
Cohesion: 0.09
Nodes (31): applyVoiceProfileUpdate(), applyVoiceScreenShareUpdate(), applyVoiceStateUpdate(), useVoiceStates(), CreateLiveKitTokenBody, CreateLiveKitTokenBodySchema, LiveKitTokenResponse, LiveKitTokenResponseSchema (+23 more)

### Community 32 - "Community 32"
Cohesion: 0.09
Nodes (31): invalidateMemberPermissionCache(), deriveWorkspaceAccessLevel(), permissionKeysToMask(), permissionMaskToKeys(), applyServerMediaSettings(), ServerMediaSettings, addWorkspaceServerMemberByUsername(), applyChannelPermissionMutation() (+23 more)

### Community 33 - "Community 33"
Cohesion: 0.07
Nodes (14): BrandLogo(), AuthFooter(), useRotatingText(), FloatCardProps, FloatCopy, FloatTone, FloatZone(), TrustCopy (+6 more)

### Community 34 - "Community 34"
Cohesion: 0.18
Nodes (32): listChannelIdsByServerForUserWithPermission(), listWorkspaceServers(), ChannelUnreadCountRow, createServerCountMap(), createUserCountMap(), emitServerUnreadUpdatesForServer(), emitServerUnreadUpdateToUser(), getActiveServerMemberUserIds() (+24 more)

### Community 35 - "Community 35"
Cohesion: 0.08
Nodes (29): DIRECT_DATABASE_PROTOCOLS, ensurePrismaClientRuntime(), findGeneratedClientIndexPath(), hasNativeEngineArtifact(), isDirectDatabaseUrl(), isPrismaProxyUrl(), loadEnvFile(), loadWorkspaceEnv() (+21 more)

### Community 36 - "Community 36"
Cohesion: 0.13
Nodes (28): getResultPreview(), getSearchPanelPosition(), MessageSearchPanel(), MessageSearchPanelProps, SearchMode, SearchPanelPosition, toIsoDateTime(), messageSearchQueryKeys (+20 more)

### Community 37 - "Community 37"
Cohesion: 0.09
Nodes (30): CreateDMBody, CreateDMBodySchema, DMConversationsPageResponseSchema, DMConversationsQuery, DMConversationsQuerySchema, DMConversationsResponseSchema, DMErrorCode, DMMessagesQuery (+22 more)

### Community 38 - "Community 38"
Cohesion: 0.1
Nodes (23): markDirectMessageRead(), PATCH(), clampChannelSidebarWidth(), clampServerRailWidth(), GET(), getUnreadCount(), listNotifications(), markAllRead() (+15 more)

### Community 39 - "Community 39"
Cohesion: 0.13
Nodes (23): assertAttachmentAccess(), assertDownloadableUrl(), contentDispositionFor(), GET(), RouteContext, CheckChannelMessageEditRateLimit, CheckChannelMessageRateLimit, CheckTypingEventAllowed (+15 more)

### Community 40 - "Community 40"
Cohesion: 0.09
Nodes (19): AdminManagedServer, AdminManagedUser, AdminManagementPanel(), AdminManagementPanelProps, formatDuration(), formatNumber(), PaginatedResponse, UserAction (+11 more)

### Community 41 - "Community 41"
Cohesion: 0.11
Nodes (29): recordMessageCreated(), createEmptyThreadSummary(), dmMessageInclude, groupDMReactions(), mapDMReply(), setDMReaction(), toggleDMReaction(), validateDMReactionEmoji() (+21 more)

### Community 42 - "Community 42"
Cohesion: 0.1
Nodes (21): createDMMessageNotifications(), DMNotificationAttachment, DMNotificationParticipant, createRealtimeDMMessage(), DMRealtimeParticipant, getDMConversationRealtimeUpdates(), isSupportedMessageAttachmentContentType(), AttachmentLink (+13 more)

### Community 43 - "Community 43"
Cohesion: 0.11
Nodes (28): upsertVoiceState(), acquireVoiceCleanupLock(), acquireVoiceJoinLocks(), buildVoiceStateParticipantsForChannel(), cleanupStaleVoiceStates(), enforceVoiceRoomCapacity(), ensureNotServerBanned(), getStaleVoiceHeartbeatCutoff() (+20 more)

### Community 44 - "Community 44"
Cohesion: 0.08
Nodes (23): AUDIENCE_SELECTOR_OPTIONS, AudienceSelector(), AudienceSelectorOption, AudienceSelectorProps, AudienceSelectorValue, AUDIENCE_ICON_CLASS, AUDIENCES, AudienceTone (+15 more)

### Community 45 - "Community 45"
Cohesion: 0.12
Nodes (15): test, loginAs(), expectVoiceParticipantCount(), getE2EServerRoute(), openLoggedInPage(), bobMessage, LoggedInPage, openLoggedInPage() (+7 more)

### Community 46 - "Community 46"
Cohesion: 0.17
Nodes (24): checkPasswordResetRateLimit(), checkVerificationResendRateLimit(), forgotPasswordAction(), getFormValue(), getRequestIpAddress(), loginAction(), mapPasswordResetError(), registerAction() (+16 more)

### Community 47 - "Community 47"
Cohesion: 0.09
Nodes (21): headers, authBodyFont, authDisplayFont, bodyFont, displayFont, messageInterFont, messageJetBrainsMonoFont, messageOpenSansFont (+13 more)

### Community 48 - "Community 48"
Cohesion: 0.13
Nodes (24): POST(), GET(), readCountryCode(), cleanTitle(), createGiphyAttachment(), CreateGiphyAttachmentSchema, E2E_GIFS, fetchGiphyJson() (+16 more)

### Community 49 - "Community 49"
Cohesion: 0.13
Nodes (23): GET(), listDirectMessages(), fetchChannelMessages(), assertChannelAccess(), GET(), mapSettingsToLevel(), PATCH(), RouteContext (+15 more)

### Community 50 - "Community 50"
Cohesion: 0.15
Nodes (22): mapDMParticipant(), readPresence(), isRecord(), normalizeNullableString(), normalizePresenceStatus(), parsePresencePayload(), parsePresenceRecord(), PRESENCE_STATUSES (+14 more)

### Community 51 - "Community 51"
Cohesion: 0.16
Nodes (22): createMessageSendFanoutMetrics(), createPermissionCacheMetrics(), createUnreadFanoutMetrics(), flushWorkspacePerformanceMetrics(), flushWorkspacePerformanceMetricsForTest(), getFlushIntervalMs(), hasMetricsToFlush(), isWorkspacePerformanceMetricsEnabled() (+14 more)

### Community 52 - "Community 52"
Cohesion: 0.18
Nodes (16): AdminLayout(), requireAdminOrRedirect(), getCurrentUser(), requireAuth(), LocaleSessionSync(), LocaleSessionSyncProps, getVisibleStatus(), MainLayout() (+8 more)

### Community 53 - "Community 53"
Cohesion: 0.19
Nodes (16): SocketProvider(), getSocket(), getSocketUrl(), createHandlerContext(), ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData (+8 more)

### Community 54 - "Community 54"
Cohesion: 0.18
Nodes (19): applyAppBadge(), BadgeNavigator, clampNotificationText(), DESKTOP_NOTIFICATION_TYPES, DesktopExperience(), getGenericNotificationBody(), getNotificationApi(), getNotificationBody() (+11 more)

### Community 55 - "Community 55"
Cohesion: 0.12
Nodes (12): CameraDeviceOption, CameraDevicesState, canEnumerateDevices(), canPreviewCamera(), useCameraDevices(), E2EVoiceProvider(), useVoiceStore, VoiceCameraRotation (+4 more)

### Community 56 - "Community 56"
Cohesion: 0.1
Nodes (19): buildVoiceStateDeleteWhere(), canClearVoiceStateForSession(), runVoiceStateClearMutation(), runVoiceStateUpsertMutation(), [, channelLock], ClearMutationInput, { deleteManyCalls, voiceState }, existingState (+11 more)

### Community 57 - "Community 57"
Cohesion: 0.17
Nodes (15): clearE2EVoiceStates(), createIsolatedServerForMembershipTest(), E2EPrismaClient, getDMUnreadCount(), getE2EDMConversationId(), getE2EUserId(), getE2EUserPreferences(), getServerMemberId() (+7 more)

### Community 58 - "Community 58"
Cohesion: 0.16
Nodes (18): checkedKeys, error, redis, CHANNEL_MESSAGE_EDIT_RATE_LIMIT, CHANNEL_MESSAGE_RATE_LIMIT, ChannelMessageRateLimitResult, checkChannelMessageEditRateLimit(), checkChannelMessageRateLimit() (+10 more)

### Community 59 - "Community 59"
Cohesion: 0.18
Nodes (20): buildMemberGroups(), getGroupPreview(), getMemberRole(), getRoleColorStyle(), getRoleDisplay(), getRoleKind(), getRoleRank(), getStatusDotClass() (+12 more)

### Community 60 - "Community 60"
Cohesion: 0.1
Nodes (20): 1. PROJECT STRUCTURE AUDIT, 2. DATABASE SCHEMA AUDIT, 3. AUTHENTICATION AUDIT, 4. LAYOUT & UI AUDIT, 5. API ROUTES AUDIT, 6. DATA FETCHING & STATE AUDIT, 7. TYPESCRIPT & CODE QUALITY AUDIT, 8. PERFORMANCE & BEST PRACTICES AUDIT (+12 more)

### Community 61 - "Community 61"
Cohesion: 0.27
Nodes (18): AccountSettingsField, broadcastUserProfileUpdate(), isTrustedAvatarUrl(), mapUserToAccountState(), mapVisiblePresenceStatus(), updateAccountAvatarAction(), UpdateAccountAvatarSchema, updateAccountSettingsAction() (+10 more)

### Community 62 - "Community 62"
Cohesion: 0.12
Nodes (15): messageByText(), addQuickReaction(), browserDialogs, composer, LoggedInPage, message, messageByText(), messageList (+7 more)

### Community 63 - "Community 63"
Cohesion: 0.19
Nodes (15): GET(), withTimeout(), defaultRedisCheck(), DependencyStatus, getHealthPayload(), getOperationalProbeResponse(), getReadinessPayload(), getReadinessStatusCode() (+7 more)

### Community 64 - "Community 64"
Cohesion: 0.22
Nodes (17): SoundEffectsProvider(), SoundEffectsProviderProps, toAudioVolume(), SettingsPanel(), clampSoundVolume(), DEFAULT_SOUND_PREFERENCES, isRecord(), isSoundProfileKey() (+9 more)

### Community 65 - "Community 65"
Cohesion: 0.15
Nodes (15): DEFAULT_VOICE_AUDIO_PREFERENCES, DEFAULT_VOICE_CAMERA_PREFERENCES, PersistedVoiceStoreState, sanitizeCameraPreferences(), sanitizeCameraRotation(), sanitizeScreenShareQuality(), VoiceAudioPreferences, VoiceCameraPreferences (+7 more)

### Community 66 - "Community 66"
Cohesion: 0.22
Nodes (17): endAllMediaUsageSessionsForVoiceSession(), endAppSession(), endMediaUsageSession(), getUtcDayStart(), HeaderSource, heartbeatAppSession(), incrementMetricAcrossInterval(), incrementUserDailyMetric() (+9 more)

### Community 67 - "Community 67"
Cohesion: 0.15
Nodes (16): assertWebEnvironment(), EnvSource, EnvValidationResult, isBooleanFlag(), isPositiveInteger(), isPresent(), isValidUrl(), OPTIONAL_BOOLEAN_ENV_VARS (+8 more)

### Community 68 - "Community 68"
Cohesion: 0.21
Nodes (13): DotGrid(), cloneDotGridTheme(), DARK_DOT_GRID_THEME, DotGridThemeValues, LIGHT_DOT_GRID_THEME, buildDots(), DotGridPoint, getGridSpacing() (+5 more)

### Community 69 - "Community 69"
Cohesion: 0.27
Nodes (15): AccountSettingsState, UpdateAccountAvatarResult, AVATAR_CONTENT_TYPES, buildAvatarFallback(), clamp(), clampDraftOffset(), createCroppedAvatarFile(), CropDraft (+7 more)

### Community 70 - "Community 70"
Cohesion: 0.23
Nodes (14): AnalyticsClientInfo, detectBrowser(), detectClientType(), detectDeviceType(), detectOs(), getAnalyticsClientInfo(), getFirstForwardedIp(), getIpAddress() (+6 more)

### Community 71 - "Community 71"
Cohesion: 0.24
Nodes (12): assertSafeE2EDatabase(), assertSafeE2ERedis(), createE2EPrismaClient(), E2E_CONTRIBUTOR_NAMES, FORBIDDEN_HOST_PARTS, getE2EDatabaseUrl(), resetAndSeedE2EData(), resetE2EData() (+4 more)

### Community 72 - "Community 72"
Cohesion: 0.3
Nodes (13): deleteAllNotifications(), fetchNotifications(), fetchUnreadCount(), markAllNotificationsRead(), markNotificationRead(), notificationsQueryKeys, requestJson(), RequestOptions (+5 more)

### Community 73 - "Community 73"
Cohesion: 0.2
Nodes (13): applyScreenShareQualityToTrack(), applyScreenShareEncodingToSender(), buildScreenShareMediaConstraints(), getScreenShareCaptureOptions(), getScreenSharePublishOptions(), getScreenShareQualityPreset(), H1080_FPS60_PRESET, H1440_FPS30_PRESET (+5 more)

### Community 74 - "Community 74"
Cohesion: 0.2
Nodes (9): DesktopDiagnosticsPanel(), DiagnosticTone, useVoiceConnection(), ActiveVoiceReminder(), findVoiceChannel(), getRouteContext(), RouteContext, safeDecodePathSegment() (+1 more)

### Community 75 - "Community 75"
Cohesion: 0.26
Nodes (11): AudioDeviceKind, AudioDeviceOption, AudioDevicesState, canEnumerateDevices(), canSelectAudioOutput(), useAudioDevices(), AudioDeviceSelect(), AudioDeviceSelectProps (+3 more)

### Community 76 - "Community 76"
Cohesion: 0.32
Nodes (12): cacheUserPresence(), getPresenceRedisKey(), getUserPresenceBroadcast(), mapStoredPresenceStatus(), cleanupPresence(), initializePresence(), addPresenceSocket(), getPresenceSocketsKey() (+4 more)

### Community 77 - "Community 77"
Cohesion: 0.15
Nodes (11): capability, desktopRoot, env, execFileAsync, generatedConfig, generatedConfigPath, runTauriScript, scriptPath (+3 more)

### Community 78 - "Community 78"
Cohesion: 0.18
Nodes (10): EmojiPicker(), EmojiPickerProps, EmojiSelection, Picker, GifPicker(), GifPickerProps, GiphyAttachmentResponse, GiphyGif (+2 more)

### Community 79 - "Community 79"
Cohesion: 0.15
Nodes (12): Build Commands, CI Plan, code:powershell (pnpm --filter @wizards/web typecheck), code:powershell (pnpm --filter @wizards/desktop build:desktop), code:text (apps/desktop/src-tauri/target/release/bundle/nsis/), macOS And Linux Readiness, Release Checklist, Scope (+4 more)

### Community 80 - "Community 80"
Cohesion: 0.17
Nodes (6): drawer, message, mobileViewports, popup, reactionPicker, toolbar

### Community 81 - "Community 81"
Cohesion: 0.29
Nodes (8): AppUpdateNotifier(), fetchLatestVersion(), formatBuildId(), getWhisprVersionPayload(), WHISPR_APP_VERSION, WHISPR_RELEASE_NOTES, WhisprVersionPayload, GET()

### Community 82 - "Community 82"
Cohesion: 0.2
Nodes (8): findScreenShareTrack(), parseParticipantMetadata(), UseDMScreenShareInput, getParticipantProfile(), isScreenSharePermissionDenied(), isScreenShareSupported(), parseParticipantMetadata(), fetchLiveKitToken()

### Community 83 - "Community 83"
Cohesion: 0.17
Nodes (11): Auth And Session, Desktop Diagnostics, Install And Launch, Navigation, Notifications And Native UX, Realtime Messaging, Regression Pass, Settings And Shortcuts (+3 more)

### Community 84 - "Community 84"
Cohesion: 0.25
Nodes (9): generateMetadata(), getLineKind(), isLegalDocumentId(), LEGAL_DOCUMENTS, LegalDocumentId, LegalDocumentPage(), LegalDocumentPageProps, readLegalDocument() (+1 more)

### Community 85 - "Community 85"
Cohesion: 0.29
Nodes (8): assertTurnstileHostnameAllowed(), getExpectedTurnstileHostnames(), getTurnstileErrorMessageKey(), getTurnstileSecret(), TurnstileErrorCode, TurnstileSiteVerifyResponse, TurnstileVerificationError, verifyTurnstileToken()

### Community 86 - "Community 86"
Cohesion: 0.22
Nodes (9): joinServerRoomsForUser(), listServerRoomIdsPage(), normalizeServerRoomJoinBatchSize(), calls, cursors, joinedRooms, memberships, pageSizes (+1 more)

### Community 87 - "Community 87"
Cohesion: 0.18
Nodes (10): Architecture, code:powershell (pnpm install), code:powershell (pnpm --filter @wizards/desktop dev), code:powershell ($env:TAURI_DEV_WEB_URL="http://localhost:3001"), code:powershell (pnpm --filter @wizards/desktop build:desktop), code:powershell ($env:TAURI_WEB_URL="https://uat.whispr.team"), Desktop Shortcuts, Local Development (+2 more)

### Community 88 - "Community 88"
Cohesion: 0.18
Nodes (10): code:env (WORKSPACE_PERFORMANCE_METRICS=true), code:text ([workspace-performance]), code:env (WORKSPACE_PERFORMANCE_METRICS=false), code:env (PERMISSION_CACHE_DISABLED=true), Healthy UAT Shape, Log Signal, Rollback, UAT Env (+2 more)

### Community 89 - "Community 89"
Cohesion: 0.42
Nodes (7): assertSuccessfulE2EResponse(), expectLoggedIn(), expectLoggedOut(), loginViaUi(), logout(), logoutViaUi(), expectUserStatus()

### Community 90 - "Community 90"
Cohesion: 0.22
Nodes (6): nextConfig, packageJson, securityHeaders, whisprCommitId, whisprDeployId, whisprGeneratedBuildId

### Community 91 - "Community 91"
Cohesion: 0.28
Nodes (5): attachmentDraftByFilename(), lightbox, message, waitForReadyAttachmentDraft(), AttachmentDraft

### Community 92 - "Community 92"
Cohesion: 0.28
Nodes (8): user, jwt(), session(), stringOrEmpty(), stringOrNull(), JWT, Session, User

### Community 93 - "Community 93"
Cohesion: 0.25
Nodes (6): E2EUploadOptions, E2EUploadResponse, readFileAsDataUrl(), uploadE2EFile(), useE2EUploadThing, WizardsUploadRouter

### Community 94 - "Community 94"
Cohesion: 0.31
Nodes (6): LANGUAGE_OPTIONS, ThemeToggle(), getSystemTheme(), LoginTheme, readStoredTheme(), useLoginTheme()

### Community 95 - "Community 95"
Cohesion: 0.22
Nodes (6): DMParticipantIdentity, FindBlockedUserIdsForUser, getBlockedUserIdsForUser(), assertUnblockedDMParticipants(), checkedCandidateUserIds, { ctx, events }

### Community 96 - "Community 96"
Cohesion: 0.61
Nodes (6): getAppIconById(), AppIconProvider(), applyAppIcon(), applyAttributes(), ensureOwnedIconLink(), updateIconLink()

### Community 97 - "Community 97"
Cohesion: 0.25
Nodes (7): AsyncMethod, banDelegate, calls, channelDelegate, memberDelegate, roleDelegate, serverDelegate

### Community 98 - "Community 98"
Cohesion: 0.53
Nodes (5): createRedisClient(), getRedisOptions(), getRedisSub(), getRedisUrl(), REDIS_PROTOCOLS

### Community 99 - "Community 99"
Cohesion: 0.4
Nodes (4): compat, __dirname, eslintConfig, __filename

### Community 101 - "Community 101"
Cohesion: 0.67
Nodes (3): getToken(), ResetPasswordPage(), ResetPasswordPageProps

## Knowledge Gaps
- **733 isolated node(s):** `scriptPath`, `desktopRoot`, `generatedDir`, `generatedConfigPath`, `extraArgs` (+728 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useI18n()` connect `Community 12` to `Community 1`, `Community 2`, `Community 3`, `Community 6`, `Community 8`, `Community 9`, `Community 10`, `Community 14`, `Community 15`, `Community 23`, `Community 25`, `Community 26`, `Community 29`, `Community 30`, `Community 33`, `Community 36`, `Community 37`, `Community 40`, `Community 44`, `Community 47`, `Community 52`, `Community 53`, `Community 54`, `Community 55`, `Community 59`, `Community 64`, `Community 69`, `Community 72`, `Community 74`, `Community 75`, `Community 78`, `Community 81`, `Community 82`, `Community 94`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `VoiceProvider()` connect `Community 8` to `Community 65`, `Community 2`, `Community 37`, `Community 73`, `Community 74`, `Community 43`, `Community 12`, `Community 75`, `Community 46`, `Community 15`, `Community 47`, `Community 16`, `Community 82`, `Community 53`, `Community 54`, `Community 55`, `Community 29`, `Community 31`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `WorkspaceChannel` connect `Community 5` to `Community 1`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `scriptPath`, `desktopRoot`, `generatedDir` to the rest of the system?**
  _733 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._