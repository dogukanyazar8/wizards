fn main() {
    println!("cargo:rerun-if-env-changed=WHISPR_DESKTOP_WEB_URL");
    println!("cargo:rerun-if-env-changed=WHISPR_DESKTOP_RELEASE_RING");
    println!("cargo:rerun-if-env-changed=WHISPR_DESKTOP_UPDATER_ENABLED");

    const WHISPR_DESKTOP_COMMANDS: &[&str] = &[
        "complete_desktop_before_close",
        "configure_desktop_voice_shortcuts",
        "export_desktop_diagnostics_bundle",
        "get_desktop_app_info",
        "get_desktop_autostart_enabled",
        "get_desktop_companion_surfaces_status",
        "get_desktop_foreground_process_name",
        "get_desktop_main_window_focused",
        "get_desktop_platform_capabilities",
        "get_desktop_quit_on_close_enabled",
        "get_desktop_voice_shortcut_status",
        "promote_desktop_main_window",
        "publish_desktop_game_overlay_snapshot",
        "publish_desktop_voice_mini_snapshot",
        "refresh_desktop_companion_surfaces",
        "set_desktop_activity_status",
        "set_desktop_autostart_enabled",
        "set_desktop_game_overlay_visible",
        "set_desktop_quit_on_close_enabled",
        "set_desktop_voice_mini_visible",
    ];

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(WHISPR_DESKTOP_COMMANDS)),
    )
    .expect("failed to build Whispr desktop Tauri ACL manifest")
}
