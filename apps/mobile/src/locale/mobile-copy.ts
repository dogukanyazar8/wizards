export type MobileLocale = "tr" | "en";

export const mobileCopy = {
  tr: {
    apiContract:
      "Guvenli API istemcisi relative path, timeout ve bearer header sozlesmesiyle hazir.",
    appSubtitle: "Mobil shell, guvenli oturum ve hazirlanan native akislar",
    appTitle: "Whispr Mobile",
    authChecking: "Guvenli oturum kontrol ediliyor",
    authSignedIn: "Mobil oturum guvenli depodan yuklendi",
    authSignedOut: "Mobil oturum icin guvenli web girisi gerekiyor",
    authSummary:
      "Token saklama SecureStore uzerinde fail-closed calisir. Web girisi yalnizca tek kullanimlik handoff uretir; kalici token URL'ye yazilmaz.",
    bootstrapDescription:
      "Auth'lu mobil bootstrap endpoint'i app surumu, guvenli kullanici ozeti ve hangi native ozelliklerin server contract bekledigini doner.",
    bootstrapReady: "Mobil bootstrap sozlesmesi hazir",
    bootstrapTitle: "Backend bootstrap",
    deepLinkAccepted: "Guvenli baglanti alindi",
    deepLinkAuthPending:
      "Oturum handoff baglantisi alindi. Tek kullanimlik token server'da tuketilip guvenli mobil oturum olusturuluyor.",
    deepLinkInvitePending:
      "Davet baglantisi dogrulandi. Mobil davet kabul akisi backend sozlesmesi tamamlandiginda etkinlesecek.",
    deepLinkReady: "Guvenli deep link dinleyicisi aktif",
    deepLinkRejected: "Guvensiz veya desteklenmeyen baglanti reddedildi",
    deepLinkRoutePending: "Guvenli uygulama rotasi alindi.",
    deepLinkTitle: "Native baglanti guvenligi",
    foundation:
      "Expo React Native omurgasi artik tab tabanli mobil shell, guvenli session repository, deep link guard, permission bootstrap ve release kalite kapisiyla ilerliyor.",
    gatedChecking: "Oturum dogrulanirken bu ekran hazirlaniyor.",
    gatedSignedOut: "Bu mobil alan gercek Whispr oturumu gerektirir.",
    guardrail1: "SecureStore tabanli token saklama",
    guardrail2: "UAT / canary / production profilleri",
    guardrail3: "Token veya PII loglamayan diagnostik",
    messagesDescription:
      "DM ve kanal listeleri native bootstrap API sozlesmesi tamamlandiginda gercek verilerle acilacak.",
    messagesEmpty: "Mobil mesajlar icin gercek oturum bekleniyor.",
    overviewDescription:
      "Mobil urun omurgasi; session, API client, navigation, ortam ve release sozlesmelerini guvenli bicimde bir araya getirir.",
    permissionCamera: "Kamera",
    permissionMicrophone: "Mikrofon",
    permissionNotifications: "Bildirimler",
    permissionPhotoLibrary: "Fotograf arsivi",
    permissionReady:
      "Izinler kullanici aksiyonu olmadan otomatik istenmez. Voice, kamera, dosya ve bildirim akislari guvenli onboarding bekler.",
    permissionTitle: "Izin hazirligi",
    primaryAction: "Whispr web girisini ac",
    releaseReady: "EAS profilleri, HTTPS endpointleri ve performans butceleri kontrol ediliyor.",
    releaseTitle: "Release kalite kapisi",
    secondaryAction: "Oturumu yenile",
    settingsDescription:
      "Ortam, session ve diagnostik bilgileri token veya kisisel veri gostermeden kontrol edilir.",
    signOutAction: "Guvenli cikis yap",
    status: "Asama 5",
    tabMessages: "Sohbet",
    tabOverview: "Ozet",
    tabSettings: "Ayarlar",
    tabVoice: "Ses",
    voiceDescription:
      "LiveKit ve native cihaz izinleri baglanana kadar ses odasi state'i sahte katilimci uretmeden kapali tutulur.",
    voiceEmpty: "Mobil ses deneyimi guvenli native izin sozlesmesini bekliyor.",
  },
  en: {
    apiContract: "The secure API client is ready with relative paths, timeouts, and bearer headers.",
    appSubtitle: "Mobile shell, secure session, and prepared native flows",
    appTitle: "Whispr Mobile",
    authChecking: "Checking secure session",
    authSignedIn: "Mobile session loaded from secure storage",
    authSignedOut: "Secure web sign-in is required for a mobile session",
    authSummary:
      "Token storage is fail-closed on SecureStore. Web sign-in only creates a one-time handoff; persistent tokens never travel in URLs.",
    bootstrapDescription:
      "The authenticated mobile bootstrap endpoint returns app version, a safe user summary, and which native features still require real server contracts.",
    bootstrapReady: "Mobile bootstrap contract is ready",
    bootstrapTitle: "Backend bootstrap",
    deepLinkAccepted: "Safe link received",
    deepLinkAuthPending:
      "A sign-in handoff link was received. The one-time token is being consumed server-side to create a secure mobile session.",
    deepLinkInvitePending:
      "The invite link was validated. Mobile invite acceptance will be enabled when the backend contract is complete.",
    deepLinkReady: "Safe deep-link listener is active",
    deepLinkRejected: "Unsafe or unsupported link was rejected",
    deepLinkRoutePending: "A safe app route was received.",
    deepLinkTitle: "Native link safety",
    foundation:
      "The Expo React Native foundation now includes a tabbed mobile shell, secure session repository, deep-link guard, permission bootstrap management, and a release quality gate.",
    gatedChecking: "This screen is preparing while the session is verified.",
    gatedSignedOut: "This mobile area requires a real Whispr session.",
    guardrail1: "SecureStore-based token storage",
    guardrail2: "UAT / canary / production profiles",
    guardrail3: "Diagnostics without tokens or PII",
    messagesDescription:
      "DMs and channel lists will open with real data once the native bootstrap API contract is complete.",
    messagesEmpty: "Mobile messaging is waiting for a real session.",
    overviewDescription:
      "The mobile product shell combines session, API client, navigation, environment, and release contracts safely.",
    permissionCamera: "Camera",
    permissionMicrophone: "Microphone",
    permissionNotifications: "Notifications",
    permissionPhotoLibrary: "Photo library",
    permissionReady:
      "Permissions are never requested automatically without a user action. Voice, camera, file, and notification flows wait for safe onboarding.",
    permissionTitle: "Permission readiness",
    primaryAction: "Open Whispr web sign-in",
    releaseReady: "EAS profiles, HTTPS endpoints, and performance budgets are checked before promotion.",
    releaseTitle: "Release quality gate",
    secondaryAction: "Refresh session",
    settingsDescription:
      "Environment, session, and diagnostics are visible without exposing tokens or personal data.",
    signOutAction: "Sign out securely",
    status: "Phase 5",
    tabMessages: "Chat",
    tabOverview: "Overview",
    tabSettings: "Settings",
    tabVoice: "Voice",
    voiceDescription:
      "Voice room state stays closed without fake participants until LiveKit and native device permission contracts are connected.",
    voiceEmpty: "Mobile voice is waiting for the secure native permission contract.",
  },
} as const;
