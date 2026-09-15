use tauri::AppHandle;
#[cfg(windows)]
use tauri::Manager;

pub fn permission(app: &AppHandle) -> Result<&'static str, String> {
    #[cfg(windows)]
    {
        windows_notifications::permission(app).map_err(|error| {
            eprintln!("Whispr notification status failed: {error}");
            "Notification status unavailable.".into()
        })
    }
    #[cfg(not(windows))]
    {
        use tauri_plugin_notification::NotificationExt;
        app.notification()
            .permission_state()
            .map(|state| match state {
                tauri::plugin::PermissionState::Granted => "granted",
                tauri::plugin::PermissionState::Denied => "denied",
                _ => "prompt",
            })
            .map_err(|error| {
                eprintln!("Whispr notification status failed: {error}");
                "Notification status unavailable.".into()
            })
    }
}

pub fn send(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    if title.is_empty() || title.len() > 512 || body.len() > 8192 {
        return Err("Invalid notification content.".into());
    }
    #[cfg(windows)]
    {
        windows_notifications::send(app, title, body)
            .map_err(|_| "Notification could not be sent.".into())
    }
    #[cfg(not(windows))]
    {
        use tauri_plugin_notification::NotificationExt;
        app.notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map_err(|_| "Notification could not be sent.".into())
    }
}

#[cfg(any(windows, test))]
fn escape_xml(text: &str) -> String {
    text.chars()
        .filter(|c| *c >= ' ' || matches!(c, '\n' | '\r' | '\t'))
        .fold(String::new(), |mut result, c| {
            match c {
                '&' => result.push_str("&amp;"),
                '<' => result.push_str("&lt;"),
                '>' => result.push_str("&gt;"),
                '"' => result.push_str("&quot;"),
                '\'' => result.push_str("&apos;"),
                _ => result.push(c),
            }
            result
        })
}

#[cfg(windows)]
mod windows_notifications {
    use super::*;
    use std::sync::Mutex;
    use windows::{
        core::{HSTRING, PCWSTR},
        Data::Xml::Dom::XmlDocument,
        Win32::{
            Foundation::RPC_E_CHANGED_MODE,
            System::{Registry::*, WinRT::*},
        },
        UI::Notifications::{
            NotificationSetting, ToastNotification, ToastNotificationManager, ToastNotifier,
        },
    };

    static IDENTITY: Mutex<bool> = Mutex::new(false);
    struct Apartment(bool);
    impl Apartment {
        fn enter() -> windows::core::Result<Self> {
            match unsafe { RoInitialize(RO_INIT_MULTITHREADED) } {
                Ok(()) => Ok(Self(true)),
                Err(error) if error.code() == RPC_E_CHANGED_MODE => Ok(Self(false)),
                Err(error) => Err(error),
            }
        }
    }
    impl Drop for Apartment {
        fn drop(&mut self) {
            if self.0 {
                unsafe { RoUninitialize() };
            }
        }
    }
    struct Key(HKEY);
    impl Drop for Key {
        fn drop(&mut self) {
            let _ = unsafe { RegCloseKey(self.0) };
        }
    }

    fn register(app: &AppHandle) -> Result<(), String> {
        // Register only our per-user identity. Never change Windows notification policy.
        let id = &app.config().identifier;
        if id.is_empty()
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b".-_".contains(&b))
        {
            return Err("Invalid application identity.".into());
        }
        let directory = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let icon = directory.join("notification-icon.png");
        std::fs::write(&icon, include_bytes!("../icons/128x128.png")).map_err(|e| e.to_string())?;
        let path = HSTRING::from(format!("Software\\Classes\\AppUserModelId\\{id}"));
        let mut handle = HKEY::default();
        unsafe {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                &path,
                None,
                PCWSTR::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_SET_VALUE,
                None,
                &mut handle,
                None,
            )
            .ok()
        }
        .map_err(|e| e.to_string())?;
        let key = Key(handle);
        for (name, value) in [
            ("DisplayName", "Whispr".to_string()),
            ("IconUri", icon.to_string_lossy().into_owned()),
        ] {
            let bytes: Vec<u8> = value
                .encode_utf16()
                .chain(Some(0))
                .flat_map(u16::to_le_bytes)
                .collect();
            unsafe { RegSetValueExW(key.0, &HSTRING::from(name), None, REG_SZ, Some(&bytes)).ok() }
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    fn notifier(app: &AppHandle) -> Result<ToastNotifier, String> {
        {
            let mut registered = IDENTITY
                .lock()
                .map_err(|_| "Notification identity lock failed.")?;
            if !*registered {
                register(app)?;
                *registered = true;
            }
        }
        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(
            &app.config().identifier,
        ))
        .map_err(|e| e.to_string())
    }
    pub fn permission(app: &AppHandle) -> Result<&'static str, String> {
        let _apartment = Apartment::enter().map_err(|e| e.to_string())?;
        permission_from_result(notifier(app)?.Setting())
    }
    fn permission_from_result(
        result: windows::core::Result<NotificationSetting>,
    ) -> Result<&'static str, String> {
        match result {
            Ok(setting) => Ok(permission_from_setting(setting)),
            // Windows has no delivery record before this identity's first toast.
            // This is neither a denial nor proof that notifications are enabled.
            Err(error) if error.code() == windows::core::HRESULT(0x80070490u32 as i32) => {
                Ok("prompt")
            }
            Err(error) => Err(error.to_string()),
        }
    }
    fn permission_from_setting(setting: NotificationSetting) -> &'static str {
        match setting {
            NotificationSetting::Enabled => "granted",
            NotificationSetting::DisabledForApplication
            | NotificationSetting::DisabledForUser
            | NotificationSetting::DisabledByGroupPolicy
            | NotificationSetting::DisabledByManifest => "denied",
            _ => "unknown",
        }
    }
    pub fn send(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
        let _apartment = Apartment::enter().map_err(|e| e.to_string())?;
        let notifier = notifier(app)?;
        if !matches!(
            permission_from_result(notifier.Setting())?,
            "granted" | "prompt"
        ) {
            return Err("Notifications disabled by the system.".into());
        }
        let xml = XmlDocument::new().map_err(|e| e.to_string())?;
        xml.LoadXml(&HSTRING::from(format!("<toast><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual></toast>", escape_xml(title), escape_xml(body)))).map_err(|e| e.to_string())?;
        let toast = ToastNotification::CreateToastNotification(&xml).map_err(|e| e.to_string())?;
        notifier.Show(&toast).map_err(|e| e.to_string())
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn first_delivery_is_prompt_and_other_windows_errors_remain_errors() {
            let missing =
                windows::core::Error::from_hresult(windows::core::HRESULT(0x80070490u32 as i32));
            assert_eq!(permission_from_result(Err(missing)).unwrap(), "prompt");
            let denied =
                windows::core::Error::from_hresult(windows::core::HRESULT(0x80070005u32 as i32));
            assert!(permission_from_result(Err(denied)).is_err());
        }

        #[test]
        fn permission_reflects_each_windows_policy_without_granting_unknown_states() {
            assert_eq!(
                permission_from_setting(NotificationSetting::Enabled),
                "granted"
            );
            for setting in [
                NotificationSetting::DisabledForApplication,
                NotificationSetting::DisabledForUser,
                NotificationSetting::DisabledByGroupPolicy,
                NotificationSetting::DisabledByManifest,
            ] {
                assert_eq!(permission_from_setting(setting), "denied");
            }
            assert_eq!(permission_from_setting(NotificationSetting(-1)), "unknown");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn notification_content_cannot_inject_xml_or_control_characters() {
        assert_eq!(escape_xml("<&\"'>\0\n"), "&lt;&amp;&quot;&apos;&gt;\n");
        assert_eq!(escape_xml("Whispr · Merhaba"), "Whispr · Merhaba");
    }
}
