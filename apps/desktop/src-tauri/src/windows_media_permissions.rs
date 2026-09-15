use crate::{
    current_unix_ms, is_same_origin,
    media_permissions::{
        resolve_webview_media_permission, DesktopMediaPermissionBroker, DesktopMediaPermissionKind,
        WebviewMediaPermissionDecision, WebviewMediaPermissionState,
    },
};
use tauri::webview::WebviewWindow;
use url::Url;
use webview2_com::{
    take_pwstr,
    Microsoft::Web::WebView2::Win32::{
        ICoreWebView2PermissionRequestedEventArgs, ICoreWebView2PermissionRequestedEventArgs2,
        ICoreWebView2PermissionRequestedEventArgs3, ICoreWebView2Settings2, ICoreWebView2Settings4,
        COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
        COREWEBVIEW2_PERMISSION_STATE_DEFAULT, COREWEBVIEW2_PERMISSION_STATE_DENY,
    },
    PermissionRequestedEventHandler,
};
use windows::core::{Interface, HSTRING, PWSTR};

pub(crate) fn install_webview2_media_permission_handler(
    window: &WebviewWindow,
    broker: Option<DesktopMediaPermissionBroker>,
    allowed_origin: Url,
    initial_url: Url,
) -> Result<(), String> {
    window
        .with_webview(move |webview| unsafe {
            let registration = register_webview2_media_permission_handler(
                webview.controller().CoreWebView2(),
                broker,
                allowed_origin,
                initial_url,
            );

            if let Err(error) = registration {
                eprintln!("Unable to install Whispr WebView2 media permission handler: {error}");
            }
        })
        .map_err(|error| format!("Unable to access the main WebView2 instance: {error}"))
}

unsafe fn register_webview2_media_permission_handler(
    webview: windows::core::Result<webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2>,
    broker: Option<DesktopMediaPermissionBroker>,
    allowed_origin: Url,
    initial_url: Url,
) -> windows::core::Result<()> {
    let webview = webview?;
    let settings = webview.Settings()?;
    let settings2 = settings.cast::<ICoreWebView2Settings2>()?;
    let mut agent = PWSTR::null();
    settings2.UserAgent(&mut agent)?;
    let agent = take_pwstr(agent);
    settings2.SetUserAgent(&HSTRING::from(format!(
        "{agent} WhisprDesktop/{}",
        env!("CARGO_PKG_VERSION")
    )))?;
    settings.SetIsStatusBarEnabled(false)?;
    settings.SetAreDefaultScriptDialogsEnabled(false)?;
    settings.SetAreDefaultContextMenusEnabled(false)?;
    if let Ok(settings4) = settings.cast::<ICoreWebView2Settings4>() {
        settings4.SetIsPasswordAutosaveEnabled(false)?;
        settings4.SetIsGeneralAutofillEnabled(false)?;
    }

    let handler = PermissionRequestedEventHandler::create(Box::new(move |_, args| {
        let Some(args) = args else {
            return Ok(());
        };

        match &broker {
            Some(broker) => handle_media_permission_request(&args, broker, &allowed_origin),
            None => apply_webview_media_permission_decision(
                &args,
                WebviewMediaPermissionDecision::DenyEphemeral,
            ),
        }
    }));
    let mut token = 0;
    webview.add_PermissionRequested(&handler, &mut token)?;
    webview.Navigate(&HSTRING::from(initial_url.as_str()))
}

unsafe fn handle_media_permission_request(
    args: &ICoreWebView2PermissionRequestedEventArgs,
    broker: &DesktopMediaPermissionBroker,
    allowed_origin: &Url,
) -> windows::core::Result<()> {
    let mut raw_kind = COREWEBVIEW2_PERMISSION_KIND::default();
    args.PermissionKind(&mut raw_kind)?;

    let kind = match raw_kind {
        COREWEBVIEW2_PERMISSION_KIND_CAMERA => Some(DesktopMediaPermissionKind::Camera),
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE => Some(DesktopMediaPermissionKind::Microphone),
        _ => None,
    };

    if kind.is_none() {
        return apply_webview_media_permission_decision(
            args,
            WebviewMediaPermissionDecision::DenyEphemeral,
        );
    }

    let mut uri = PWSTR::null();
    let uri = if args.Uri(&mut uri).is_ok() {
        take_pwstr(uri)
    } else {
        String::new()
    };
    let same_origin = Url::parse(&uri)
        .ok()
        .is_some_and(|candidate| is_same_origin(&candidate, allowed_origin));
    let allowed_origin_key = allowed_origin.origin().ascii_serialization();
    let has_local_grant = same_origin
        && broker.consume_grant(
            kind.expect("camera or microphone kind checked above"),
            &allowed_origin_key,
            current_unix_ms(),
        );

    let mut raw_state = COREWEBVIEW2_PERMISSION_STATE_DEFAULT;
    let saved_state = if args.State(&mut raw_state).is_err() {
        WebviewMediaPermissionState::Default
    } else if raw_state == COREWEBVIEW2_PERMISSION_STATE_ALLOW {
        WebviewMediaPermissionState::Allow
    } else if raw_state == COREWEBVIEW2_PERMISSION_STATE_DENY {
        WebviewMediaPermissionState::Deny
    } else {
        WebviewMediaPermissionState::Default
    };
    let decision =
        resolve_webview_media_permission(kind, same_origin, saved_state, has_local_grant);

    apply_webview_media_permission_decision(args, decision)
}

unsafe fn apply_webview_media_permission_decision(
    args: &ICoreWebView2PermissionRequestedEventArgs,
    decision: WebviewMediaPermissionDecision,
) -> windows::core::Result<()> {
    let (state, save_in_profile) = match decision {
        WebviewMediaPermissionDecision::AllowAndPersist => {
            (COREWEBVIEW2_PERMISSION_STATE_ALLOW, true)
        }
        WebviewMediaPermissionDecision::DenyAndPersist => {
            (COREWEBVIEW2_PERMISSION_STATE_DENY, true)
        }
        WebviewMediaPermissionDecision::DenyEphemeral => {
            (COREWEBVIEW2_PERMISSION_STATE_DENY, false)
        }
        WebviewMediaPermissionDecision::Ignore => return Ok(()),
    };

    if let Ok(args3) = args.cast::<ICoreWebView2PermissionRequestedEventArgs3>() {
        let _ = args3.SetSavesInProfile(save_in_profile);
    }
    if let Ok(args2) = args.cast::<ICoreWebView2PermissionRequestedEventArgs2>() {
        let _ = args2.SetHandled(true);
    }

    args.SetState(state)
}
