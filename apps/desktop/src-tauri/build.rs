fn main() {
    println!("cargo:rerun-if-env-changed=WHISPR_DESKTOP_WEB_URL");
    println!("cargo:rerun-if-env-changed=WHISPR_DESKTOP_BUILD_TIME");
    println!("cargo:rerun-if-env-changed=WHISPR_DESKTOP_RELEASE_RING");
    println!("cargo:rerun-if-env-changed=WHISPR_DESKTOP_UPDATER_ENABLED");

    const WHISPR_DESKTOP_COMMANDS: &[&str] = &[
        "complete_desktop_before_close",
        "configure_desktop_voice_shortcuts",
        "desktop_control_check_for_updates",
        "desktop_control_install_update",
        "desktop_control_recover",
        "desktop_control_request_notification_permission",
        "desktop_control_set_app_settings",
        "export_desktop_diagnostics_bundle",
        "get_desktop_app_info",
        "get_desktop_control_state",
        "get_desktop_companion_surfaces_status",
        "get_desktop_foreground_process_name",
        "get_desktop_main_window_focused",
        "get_desktop_platform_capabilities",
        "get_desktop_voice_shortcut_status",
        "open_desktop_permission_settings",
        "promote_desktop_main_window",
        "publish_desktop_game_overlay_snapshot",
        "publish_desktop_voice_mini_snapshot",
        "record_desktop_update_failure",
        "refresh_desktop_companion_surfaces",
        "request_desktop_media_permission",
        "resolve_desktop_media_permission",
        "set_desktop_activity_status",
        "set_desktop_game_overlay_visible",
        "set_desktop_voice_mini_visible",
        "show_desktop_control",
    ];

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(WHISPR_DESKTOP_COMMANDS)),
    )
    .expect("failed to build Whispr desktop Tauri ACL manifest")
}
