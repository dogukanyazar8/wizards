# Graph Report - Wizards  (2026-05-11)

## Corpus Check
- 334 files · ~344,008 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2391 nodes · 7321 edges · 97 communities (91 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `74f22a80`
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

## God Nodes (most connected - your core abstractions)
1. `useI18n()` - 171 edges
2. `jsonError()` - 120 edges
3. `requireApiUserId()` - 118 edges
4. `VoiceProvider()` - 88 edges
5. `enforceApiRateLimit()` - 87 edges
6. `LocaleProvider()` - 60 edges
7. `cn()` - 60 edges
8. `SettingsPanelKey` - 55 edges
9. `FriendsView()` - 53 edges
10. `parseJsonBody()` - 51 edges

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

## Communities (97 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (81): createDMConversationRequest(), CreateDMBody, CreateDMBodySchema, DMConversationsPageResponse, DMConversationsPageResponseSchema, DMConversationsQuery, DMConversationsQuerySchema, DMConversationsResponseSchema (+73 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (62): AddServerMemberInput, AddServerMemberSchema, CreateCategoryInput, CreateCategorySchema, CreateChannelInput, CreateChannelSchema, CreateInviteInput, CreateInviteSchema (+54 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (51): requestJson(), ServerFeatureToggle(), ServerFeatureToggleProps, ServerIconField(), ServerIconFieldProps, DELETED_NOTICE_OPTIONS, ELEVATED_ROLE_KEYS, formatDeletedNoticeDuration() (+43 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (61): GET(), dmAttachmentSelect, dmAuthorSelect, dmConversationInclude, DMMessageNode, dmParticipantUserSelect, DMReactionRow, dmReplyInclude (+53 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (58): DELETE(), emitPinUpdate(), getSocketServer(), emitVoiceScreenShareUpdate(), emitVoiceStateUpdate(), mapSocketParticipants(), deriveWorkspaceAccessLevel(), permissionKeysToMask() (+50 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (37): logoutAction(), getStatusDotClass(), normalizeIdleTimeoutMinutes(), PRESENCE_IDLE_TIMEOUT_OPTIONS, PresenceSocket, PresenceStatus, readStoredIdleTimeoutMinutes(), usePresenceActivity() (+29 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (45): applyRemoteAudioState(), buildAudioCaptureOptions(), collectScreenShares(), connectLiveKitRoomWithRetry(), countActiveScreenShares(), createLocalVoiceAudioLevelMonitor(), E2E_CAMERA_TRACK, getAudioCaptureRestartSignature() (+37 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (32): MessageInput(), clampPollDuration(), formatPollRemainingTime(), MessageItem, MessageItemProps, ParsedPoll, parsePollBlock(), parsePollDuration() (+24 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (46): ChannelPage(), hasAdminAccess(), channelOverrideSelect, filterUserIdsByChannelPermission(), getChannelPermissionContext(), getChannelPermissionTarget(), getServerPermissionContext(), listUserIdsWithChannelPermission() (+38 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (45): createOrOpenDirectMessage(), findDirectConversation(), areFriends(), getBlockStatus(), getFriendship(), haveMutualFriends(), haveMutualServers(), actOnFriendRequest() (+37 more)

### Community 10 - "Community 10"
Cohesion: 0.1
Nodes (42): isActiveAuthUser(), dmMessageInclude, dmNotificationUserSelect, parseSocketPayload(), SocketConversationPayloadSchema, SocketDMMessageSendPayloadSchema, SocketDMScreenShareTargetPayloadSchema, SocketIdSchema (+34 more)

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (45): DMMessagesResponse, ChatMessage, ChatMessageSchema, ChatMessageType, ChatMessageTypeSchema, EditMessageInput, EditMessageInputSchema, MessageAttachmentSchema (+37 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (35): ChannelError(), DMScreenSharePanel(), IncomingDMScreenShareModal(), ScreenShareVideo(), toggleElementFullscreen(), EmojiPicker(), EmojiPickerProps, EmojiSelection (+27 more)

### Community 13 - "Community 13"
Cohesion: 0.1
Nodes (31): requireApiUserId(), GET(), DELETE(), GET(), RouteContext, GET(), GET(), readCountryCode() (+23 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (37): isMissingUserSettingsThemeColumn(), ThemeActionResult, updateThemePreferenceAction(), ADVANCED_WIZARDS_THEMES, clampChannelSidebarWidth(), clampNotificationLimit(), clampServerRailWidth(), getThemePreviewBackground() (+29 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (34): user, normalizeUsername(), TURKISH_USERNAME_TRANSLITERATION, adapter, baseAdapter, canOAuthUserSignIn(), ForgotPasswordInput, ForgotPasswordSchema (+26 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (28): PrimaryButton(), SecondaryButton(), SocialAuthButtons(), TextInput, LoginCard(), LoginPage(), getLoginRoleHint(), LoginRole (+20 more)

### Community 17 - "Community 17"
Cohesion: 0.05
Nodes (39): Auth Helpers, CI Integration, code:bash (E2E_TEST_MODE=true), code:bash (PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm --filter @wizards/web e2e:), code:bash (pnpm --filter @wizards/db exec prisma db push --schema prism), code:bash (pnpm --filter @wizards/web exec playwright install chromium), code:bash (pnpm --filter @wizards/web e2e:smoke), code:bash (pnpm --filter @wizards/web e2e:headed) (+31 more)

### Community 18 - "Community 18"
Cohesion: 0.11
Nodes (29): CONTRIBUTOR_NAMES, CORRUPTED_CONTRIBUTOR_NAMES, configured_app_url(), dispatch_desktop_command(), handle_desktop_deep_links(), is_allowed_oauth_navigation(), is_oauth_navigation_active(), is_safe_internal_desktop_path() (+21 more)

### Community 19 - "Community 19"
Cohesion: 0.11
Nodes (29): applyDMConversationPresenceUpdateToPageData(), applyDMConversationUpdate(), applyDMConversationUpdateToPageData(), createDMConversationsInfiniteData(), DMConversationsInfiniteData, dmQueryKeys, fetchDMConversation(), fetchDMConversationsPage() (+21 more)

### Community 20 - "Community 20"
Cohesion: 0.13
Nodes (20): assertActiveApiUser(), AuthAccessUser, DMConversationParamsSchema, DMMessagesQuerySchema, RouteContext, ApiError, DELETE(), GET() (+12 more)

### Community 21 - "Community 21"
Cohesion: 0.07
Nodes (14): BrandLogo(), AuthFooter(), useRotatingText(), FloatCardProps, FloatCopy, FloatTone, FloatZone(), TrustCopy (+6 more)

### Community 22 - "Community 22"
Cohesion: 0.11
Nodes (29): VoiceCameraStatus, VoiceParticipantViewModel, VoiceScreenShareViewModel, ScreenShareQualityId, getAvatarGlowStyle(), getParticipantGridClass(), getParticipantGridStyle(), getSpeakingClass() (+21 more)

### Community 23 - "Community 23"
Cohesion: 0.1
Nodes (28): getAppIconById(), isAppIconId(), clampExpandedServerRailWidth(), clampMainPanelWidth(), clampNotificationPopupTimeoutSeconds(), clampServerRailIconSize(), ActiveRouteUpdate, ActiveWorkspaceArea (+20 more)

### Community 24 - "Community 24"
Cohesion: 0.13
Nodes (28): getResultPreview(), getSearchPanelPosition(), MessageSearchPanel(), MessageSearchPanelProps, SearchMode, SearchPanelPosition, toIsoDateTime(), messageSearchQueryKeys (+20 more)

### Community 25 - "Community 25"
Cohesion: 0.11
Nodes (25): extensionFromFilename(), gridClassName(), MessageAttachments(), MessageAttachmentsProps, formatAttachmentSize(), MessageInputProps, getMessageAttachmentMaxBytes(), isMessageAttachmentFilenameAllowed() (+17 more)

### Community 26 - "Community 26"
Cohesion: 0.12
Nodes (28): UpdateAccountSettingsResult, APP_ICON_OPTIONS, AppIconId, WhisprReleaseNote, NOTIFICATION_LIMIT_OPTIONS, patchLayoutSettings(), buildSettingsHref(), isAdvancedAppearancePanel() (+20 more)

### Community 27 - "Community 27"
Cohesion: 0.12
Nodes (24): useAppearanceHydration(), readStoredNotificationAutoClose(), useAppStore, EmptyChannelState(), MainChannelPanel(), MainChannelPanelProps, AccountUpdatedEventPayload, findActiveCategoryName() (+16 more)

### Community 28 - "Community 28"
Cohesion: 0.16
Nodes (21): Button, ButtonProps, buttonVariants, cn(), ChannelItem(), ChannelItemProps, ServerIcon(), ServerIconProps (+13 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (21): DesktopDiagnosticsPanel(), DiagnosticTone, AudioDeviceKind, AudioDeviceOption, AudioDevicesState, canEnumerateDevices(), canSelectAudioOutput(), useAudioDevices() (+13 more)

### Community 30 - "Community 30"
Cohesion: 0.08
Nodes (23): AUDIENCE_SELECTOR_OPTIONS, AudienceSelector(), AudienceSelectorOption, AudienceSelectorProps, AudienceSelectorValue, AUDIENCE_ICON_CLASS, AUDIENCES, AudienceTone (+15 more)

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (27): listChannelIdsForUserWithPermission(), getServerMediaSettings(), ServerMediaSettings, addWorkspaceServerMemberByUsername(), canAddMembers(), ensureUserNotServerBanned(), getWorkspaceServerDetail(), joinWorkspaceServerByInvite() (+19 more)

### Community 32 - "Community 32"
Cohesion: 0.1
Nodes (25): DIRECT_DATABASE_PROTOCOLS, ensurePrismaClientRuntime(), findGeneratedClientIndexPath(), hasNativeEngineArtifact(), isDirectDatabaseUrl(), isPrismaProxyUrl(), loadEnvFile(), loadWorkspaceEnv() (+17 more)

### Community 33 - "Community 33"
Cohesion: 0.14
Nodes (20): authBodyFont, authDisplayFont, bodyFont, displayFont, metadata, AuthLayout(), getCurrentUser(), requireAuth() (+12 more)

### Community 34 - "Community 34"
Cohesion: 0.16
Nodes (25): GET(), withTimeout(), createRedisClient(), getRedis(), getRedisOptions(), getRedisSub(), getRedisUrl(), REDIS_PROTOCOLS (+17 more)

### Community 35 - "Community 35"
Cohesion: 0.12
Nodes (24): applyVoiceProfileUpdate(), applyVoiceScreenShareUpdate(), applyVoiceStateUpdate(), useVoiceStates(), UserProfileUpdatedPayload, deleteVoiceState(), fetchLiveKitToken(), fetchVoiceStates() (+16 more)

### Community 36 - "Community 36"
Cohesion: 0.13
Nodes (16): ClearChannelHistoryAction(), ClearChannelHistoryActionProps, ImageLightbox(), ImageLightboxProps, fetchDMMessages(), appendMessage(), getMessagesQueryKey(), mapDMAttachments() (+8 more)

### Community 37 - "Community 37"
Cohesion: 0.14
Nodes (21): applyAppBadge(), BadgeNavigator, clampNotificationText(), DESKTOP_NOTIFICATION_TYPES, DesktopExperience(), getGenericNotificationBody(), getNotificationApi(), getNotificationBody() (+13 more)

### Community 38 - "Community 38"
Cohesion: 0.16
Nodes (26): createEmptyThreadSummary(), setDMReaction(), toggleDMReaction(), validateDMReactionEmoji(), fetchChannelMessages(), createEmptyThreadSummary(), DeleteMessageResult, getChannelMessages() (+18 more)

### Community 39 - "Community 39"
Cohesion: 0.11
Nodes (20): DELETE(), PATCH(), RouteContext, DELETE(), PATCH(), RouteContext, DELETE(), DELETE() (+12 more)

### Community 40 - "Community 40"
Cohesion: 0.14
Nodes (18): RootLayout(), LegacyAppearanceSettingsPage(), EmailVerificationResult, verifyEmailToken(), PageParams, ChannelsPage(), InvitePage(), InvitePageProps (+10 more)

### Community 41 - "Community 41"
Cohesion: 0.13
Nodes (18): ChannelConversationPage(), ChannelConversationPageProps, ChatArea(), ChatAreaProps, FloatingPanelPosition, getStatusKey(), PendingMessagePayload, useDMScreenShare() (+10 more)

### Community 42 - "Community 42"
Cohesion: 0.12
Nodes (16): POST(), POST(), RouteContext, POST(), RouteContext, PATCH(), POST(), RouteContext (+8 more)

### Community 43 - "Community 43"
Cohesion: 0.14
Nodes (19): isRecord(), DEFAULT_VOICE_AUDIO_PREFERENCES, DEFAULT_VOICE_CAMERA_PREFERENCES, isRecord(), needsCleanVoiceMigration(), PersistedVoiceStoreState, sanitizeAudioPreferences(), sanitizeCameraPreferences() (+11 more)

### Community 44 - "Community 44"
Cohesion: 0.21
Nodes (20): POST(), markDirectMessageRead(), e2eServer, E2EUserKey, e2eUsers, getE2EUserByKey(), blockUser(), findE2EUserId() (+12 more)

### Community 45 - "Community 45"
Cohesion: 0.1
Nodes (12): attachmentDraftByFilename(), lightbox, message, waitForReadyAttachmentDraft(), AttachmentDraft, drawer, message, mobileViewports (+4 more)

### Community 46 - "Community 46"
Cohesion: 0.12
Nodes (12): CameraDeviceOption, CameraDevicesState, canEnumerateDevices(), canPreviewCamera(), useCameraDevices(), E2EVoiceProvider(), useVoiceStore, VoiceCameraRotation (+4 more)

### Community 47 - "Community 47"
Cohesion: 0.19
Nodes (19): SoundEffectsProvider(), SoundEffectsProviderProps, toAudioVolume(), fetchLayoutSettings(), settingsQueryKeys, SettingsPanel(), clampSoundVolume(), DEFAULT_SOUND_PREFERENCES (+11 more)

### Community 48 - "Community 48"
Cohesion: 0.16
Nodes (16): clearE2EVoiceStates(), createIsolatedServerForMembershipTest(), E2EPrismaClient, expectUserStatus(), getDMUnreadCount(), getE2EDMConversationId(), getE2EUserId(), getE2EUserPreferences() (+8 more)

### Community 49 - "Community 49"
Cohesion: 0.23
Nodes (19): extractFirstUrl(), fetchPreview(), LinkPreviewCard(), assertPublicHttpUrl(), cacheKey(), fetchLinkPreview(), isBlockedHostname(), isBlockedIP() (+11 more)

### Community 50 - "Community 50"
Cohesion: 0.26
Nodes (19): AuthActionResult, checkPasswordResetRateLimit(), checkVerificationResendRateLimit(), forgotPasswordAction(), getFormValue(), getRequestIpAddress(), loginAction(), mapPasswordResetError() (+11 more)

### Community 51 - "Community 51"
Cohesion: 0.1
Nodes (20): 1. PROJECT STRUCTURE AUDIT, 2. DATABASE SCHEMA AUDIT, 3. AUTHENTICATION AUDIT, 4. LAYOUT & UI AUDIT, 5. API ROUTES AUDIT, 6. DATA FETCHING & STATE AUDIT, 7. TYPESCRIPT & CODE QUALITY AUDIT, 8. PERFORMANCE & BEST PRACTICES AUDIT (+12 more)

### Community 52 - "Community 52"
Cohesion: 0.12
Nodes (16): messageByText(), addQuickReaction(), browserDialogs, composer, LoggedInPage, message, messageByText(), messageList (+8 more)

### Community 53 - "Community 53"
Cohesion: 0.13
Nodes (11): expectVoiceParticipantCount(), getE2EServerRoute(), bobMessage, LoggedInPage, openLoggedInPage(), suffix, closeLoggedInPages(), errorState (+3 more)

### Community 54 - "Community 54"
Cohesion: 0.22
Nodes (13): APP_LOCALES, APP_MESSAGES, AppLocale, normalizeAppLocale(), TranslationDictionary, TranslationValues, LocaleActionResult, updateLocalePreferenceAction() (+5 more)

### Community 55 - "Community 55"
Cohesion: 0.15
Nodes (13): E2EUploadOptions, E2EUploadResponse, readFileAsDataUrl(), uploadE2EFile(), useE2EUploadThing, f, isUploadUserAllowed(), requireMessageUploadUser() (+5 more)

### Community 56 - "Community 56"
Cohesion: 0.25
Nodes (15): deleteAllNotifications(), fetchNotifications(), fetchUnreadCount(), markAllNotificationsRead(), markNotificationRead(), notificationsQueryKeys, requestJson(), RequestOptions (+7 more)

### Community 57 - "Community 57"
Cohesion: 0.18
Nodes (16): buildVerificationUrl(), EmailVerificationError, EmailVerificationErrorCode, EmailVerificationUser, escapeHtml(), GeneratedEmailVerificationToken, generateEmailVerificationToken(), getAppUrl() (+8 more)

### Community 58 - "Community 58"
Cohesion: 0.2
Nodes (16): ALLOWED_PUBLISH_SOURCES, createLiveKitToken(), ensureLiveKitEnv(), getLiveKitCredentials(), getLiveKitRoomServiceClient(), getLiveKitServiceUrl(), getLiveKitUrl(), loadEnvFallback() (+8 more)

### Community 59 - "Community 59"
Cohesion: 0.2
Nodes (16): getFirstHeaderValue(), getOrigin(), getSocketRequestOrigin(), isSocketOriginAllowed(), isSocketRequestAllowed(), attachSecurityHeaders(), buildContentSecurityPolicy(), config (+8 more)

### Community 60 - "Community 60"
Cohesion: 0.21
Nodes (13): DotGrid(), cloneDotGridTheme(), DARK_DOT_GRID_THEME, DotGridThemeValues, LIGHT_DOT_GRID_THEME, buildDots(), DotGridPoint, getGridSpacing() (+5 more)

### Community 61 - "Community 61"
Cohesion: 0.24
Nodes (13): SocketContext, SocketProvider(), getSocket(), getSocketUrl(), ClientToServerEvents, InterServerEvents, NotificationSocketPayload, ServerToClientEvents (+5 more)

### Community 62 - "Community 62"
Cohesion: 0.22
Nodes (12): assertSafeE2EDatabase(), assertSafeE2ERedis(), createE2EPrismaClient(), E2E_CONTRIBUTOR_NAMES, FORBIDDEN_HOST_PARTS, getE2EDatabaseUrl(), resetAndSeedE2EData(), resetE2EData() (+4 more)

### Community 63 - "Community 63"
Cohesion: 0.34
Nodes (8): test, assertSuccessfulE2EResponse(), expectLoggedIn(), expectLoggedOut(), loginAs(), loginViaUi(), logout(), logoutViaUi()

### Community 64 - "Community 64"
Cohesion: 0.27
Nodes (15): AccountSettingsState, UpdateAccountAvatarResult, AVATAR_CONTENT_TYPES, buildAvatarFallback(), clamp(), clampDraftOffset(), createCroppedAvatarFile(), CropDraft (+7 more)

### Community 65 - "Community 65"
Cohesion: 0.23
Nodes (15): mapDMParticipant(), readPresence(), listFriends(), isRecord(), normalizeNullableString(), normalizePresenceStatus(), parsePresencePayload(), parsePresenceRecord() (+7 more)

### Community 66 - "Community 66"
Cohesion: 0.18
Nodes (14): applyScreenShareQualityToTrack(), applyScreenShareEncodingToSender(), buildScreenShareMediaConstraints(), getScreenShareCaptureOptions(), getScreenSharePublishOptions(), getScreenShareQualityPreset(), H1080_FPS60_PRESET, H1440_FPS30_PRESET (+6 more)

### Community 67 - "Community 67"
Cohesion: 0.22
Nodes (9): API_RATE_LIMITS, ApiRateLimitAction, getApiRateLimitConfig(), requiredActions, POST(), RouteContext, GET(), RouteContext (+1 more)

### Community 68 - "Community 68"
Cohesion: 0.3
Nodes (14): AccountSettingsField, broadcastUserProfileUpdate(), isTrustedAvatarUrl(), mapUserToAccountState(), mapVisiblePresenceStatus(), updateAccountAvatarAction(), UpdateAccountAvatarSchema, updateAccountSettingsAction() (+6 more)

### Community 69 - "Community 69"
Cohesion: 0.19
Nodes (9): assertTurnstileHostnameAllowed(), getExpectedTurnstileHostnames(), getTurnstileSecret(), TurnstileErrorCode, TurnstileSiteVerifyResponse, TurnstileVerificationError, verifyTurnstileToken(), DMClientError (+1 more)

### Community 70 - "Community 70"
Cohesion: 0.15
Nodes (12): Build Commands, CI Plan, code:powershell (pnpm --filter @wizards/web typecheck), code:powershell ($env:TAURI_WEB_URL="https://app.your-whispr-domain.com"), code:text (apps/desktop/src-tauri/target/release/bundle/nsis/), macOS And Linux Readiness, Release Checklist, Scope (+4 more)

### Community 71 - "Community 71"
Cohesion: 0.29
Nodes (8): AppUpdateNotifier(), fetchLatestVersion(), formatBuildId(), getWhisprVersionPayload(), WHISPR_APP_VERSION, WHISPR_RELEASE_NOTES, WhisprVersionPayload, GET()

### Community 72 - "Community 72"
Cohesion: 0.23
Nodes (10): assertWebEnvironment(), EnvSource, EnvValidationResult, isPresent(), isValidUrl(), REQUIRED_PRODUCTION_ENV_VARS, REQUIRED_URL_ENV_VARS, result (+2 more)

### Community 73 - "Community 73"
Cohesion: 0.18
Nodes (10): isSupportedMessageAttachmentContentType(), AttachmentLink, AttachmentTransaction, claimUploadedMessageAttachments(), normalizeMessageContentForSend(), parseUploadedAttachmentInputs(), UploadedAttachmentsSchema, createMessage() (+2 more)

### Community 74 - "Community 74"
Cohesion: 0.17
Nodes (11): Auth And Session, Desktop Diagnostics, Install And Launch, Navigation, Notifications And Native UX, Realtime Messaging, Regression Pass, Settings And Shortcuts (+3 more)

### Community 75 - "Community 75"
Cohesion: 0.25
Nodes (9): generateMetadata(), getLineKind(), isLegalDocumentId(), LEGAL_DOCUMENTS, LegalDocumentId, LegalDocumentPage(), LegalDocumentPageProps, readLegalDocument() (+1 more)

### Community 76 - "Community 76"
Cohesion: 0.22
Nodes (7): findScreenShareTrack(), parseParticipantMetadata(), UseDMScreenShareInput, getParticipantProfile(), isScreenSharePermissionDenied(), isScreenShareSupported(), parseParticipantMetadata()

### Community 77 - "Community 77"
Cohesion: 0.2
Nodes (9): Architecture, code:powershell (pnpm install), code:powershell (pnpm --filter @wizards/desktop dev), code:powershell ($env:TAURI_DEV_WEB_URL="http://localhost:3001"), code:powershell ($env:TAURI_WEB_URL="https://app.your-whispr-domain.com"), Desktop Shortcuts, Local Development, Production Build (+1 more)

### Community 78 - "Community 78"
Cohesion: 0.22
Nodes (6): nextConfig, packageJson, securityHeaders, whisprCommitId, whisprDeployId, whisprGeneratedBuildId

### Community 79 - "Community 79"
Cohesion: 0.31
Nodes (6): LANGUAGE_OPTIONS, ThemeToggle(), getSystemTheme(), LoginTheme, readStoredTheme(), useLoginTheme()

### Community 80 - "Community 80"
Cohesion: 0.25
Nodes (5): NotificationRow, UserRow, VISIBLE_NOTIFICATION_TYPES, VisibleNotificationType, PATCH()

### Community 81 - "Community 81"
Cohesion: 0.43
Nodes (6): ActiveVoiceReminder(), findVoiceChannel(), getRouteContext(), RouteContext, safeDecodePathSegment(), shouldShowVoiceReminder()

### Community 82 - "Community 82"
Cohesion: 0.48
Nodes (6): assertChannelAccess(), GET(), mapSettingsToLevel(), PATCH(), RouteContext, UpdateNotificationSettingsSchema

### Community 83 - "Community 83"
Cohesion: 0.43
Nodes (5): getSafeAuthRedirectPath(), isSafeAuthRedirectPath(), SAFE_AUTH_REDIRECT_PREFIXES, LoginPage(), LoginPageProps

### Community 84 - "Community 84"
Cohesion: 0.47
Nodes (4): FriendUserIdParamsSchema, DELETE(), POST(), RouteContext

### Community 85 - "Community 85"
Cohesion: 0.4
Nodes (5): DEFAULT_NOTIFICATION_SETTINGS, GET(), mapSettingsResponse(), PATCH(), PatchSettingsSchema

### Community 86 - "Community 86"
Cohesion: 0.6
Nodes (3): checkDMMessageRateLimits(), DM_MESSAGE_CONVERSATION_RATE_LIMIT, DM_MESSAGE_GLOBAL_RATE_LIMIT

### Community 87 - "Community 87"
Cohesion: 0.4
Nodes (4): compat, __dirname, eslintConfig, __filename

### Community 88 - "Community 88"
Cohesion: 0.67
Nodes (3): getToken(), ResetPasswordPage(), ResetPasswordPageProps

## Knowledge Gaps
- **525 isolated node(s):** `scriptPath`, `desktopRoot`, `generatedDir`, `generatedConfigPath`, `devUrl` (+520 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useI18n()` connect `Community 12` to `Community 0`, `Community 2`, `Community 5`, `Community 6`, `Community 7`, `Community 9`, `Community 14`, `Community 16`, `Community 21`, `Community 22`, `Community 24`, `Community 25`, `Community 26`, `Community 27`, `Community 28`, `Community 29`, `Community 30`, `Community 33`, `Community 36`, `Community 37`, `Community 40`, `Community 41`, `Community 46`, `Community 47`, `Community 49`, `Community 54`, `Community 56`, `Community 64`, `Community 71`, `Community 76`, `Community 79`, `Community 81`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Why does `WorkspaceChannel` connect `Community 1` to `Community 3`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `VoiceProvider()` connect `Community 6` to `Community 0`, `Community 33`, `Community 66`, `Community 35`, `Community 34`, `Community 37`, `Community 5`, `Community 43`, `Community 12`, `Community 76`, `Community 46`, `Community 50`, `Community 61`, `Community 19`, `Community 22`, `Community 29`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `scriptPath`, `desktopRoot`, `generatedDir` to the rest of the system?**
  _525 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._