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
        ICoreWebView2PermissionRequestedEventArgs3, COREWEBVIEW2_PERMISSION_KIND,
        COREWEBVIEW2_PERMISSION_KIND_CAMERA, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW, COREWEBVIEW2_PERMISSION_STATE_DEFAULT,
        COREWEBVIEW2_PERMISSION_STATE_DENY,
    },
    PermissionRequestedEventHandler,
};
use windows::core::{Interface, PWSTR};

pub(crate) fn install_webview2_media_permission_handler(
    window: &WebviewWindow,
    broker: DesktopMediaPermissionBroker,
    allowed_origin: Url,
) -> Result<(), String> {
    window
        .with_webview(move |webview| unsafe {
            let registration = register_webview2_media_permission_handler(
                webview.controller().CoreWebView2(),
                broker,
                allowed_origin,
            );

            if let Err(error) = registration {
                eprintln!("Unable to install Whispr WebView2 media permission handler: {error}");
            }
        })
        .map_err(|error| format!("Unable to access the main WebView2 instance: {error}"))
}

unsafe fn register_webview2_media_permission_handler(
    webview: windows::core::Result<webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2>,
    broker: DesktopMediaPermissionBroker,
    allowed_origin: Url,
) -> windows::core::Result<()> {
    let webview = webview?;
    let handler = PermissionRequestedEventHandler::create(Box::new(move |_, args| {
        let Some(args) = args else {
            return Ok(());
        };

        handle_media_permission_request(&args, &broker, &allowed_origin)
    }));
    let mut token = 0;
    webview.add_PermissionRequested(&handler, &mut token)
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
        return Ok(());
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
