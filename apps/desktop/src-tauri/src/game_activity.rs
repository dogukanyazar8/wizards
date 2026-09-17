use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::OnceLock;

#[derive(Deserialize)]
struct Game {
    id: String,
    executables: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegisteredGame {
    pub id: String,
    pub executable: String,
    pub label: String,
}

pub fn allowed_application(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name == basename(name)
        && !name.contains(['/', '\\', ':'])
        && !name.chars().any(char::is_control)
        && ![
            "steam.exe",
            "riotclientservices.exe",
            "epicgameslauncher.exe",
            "battle.net.exe",
            "eadesktop.exe",
            "upc.exe",
            "explorer.exe",
            "dwm.exe",
            "svchost.exe",
            "system",
            "searchhost.exe",
            "shellexperiencehost.exe",
            "applicationframehost.exe",
            "msedgewebview2.exe",
            "whispr.exe",
            "wizards.exe",
        ]
        .contains(&name)
}

pub fn validate_registered(games: &[RegisteredGame]) -> Result<Vec<RegisteredGame>, String> {
    if games.len() > 64 {
        return Err("At most 64 registered games are allowed.".into());
    }
    let mut result = Vec::new();
    for game in games {
        let executable = game.executable.trim().to_ascii_lowercase();
        let label = game.label.split_whitespace().collect::<Vec<_>>().join(" ");
        if !allowed_application(&executable)
            || label.is_empty()
            || label.chars().count() > 64
            || game.label.chars().any(char::is_control)
        {
            return Err("Invalid registered game.".into());
        }
        if result
            .iter()
            .any(|entry: &RegisteredGame| entry.executable == executable)
        {
            return Err("Duplicate registered game.".into());
        }
        let hash = format!("{:x}", Sha256::digest(executable.as_bytes()));
        result.push(RegisteredGame {
            id: format!("custom:{}", &hash[..12]),
            executable,
            label,
        });
    }
    Ok(result)
}

pub fn identify_registered(name: &str, games: &[RegisteredGame]) -> Option<String> {
    identify_executable(name).or_else(|| {
        games
            .iter()
            .find(|game| allowed_application(&basename(name)) && game.executable == basename(name))
            .map(|game| game.id.clone())
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningApplication {
    executable: String,
    display_name: String,
}

#[cfg(windows)]
pub fn running_applications() -> Vec<RunningApplication> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, HWND, LPARAM},
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        },
        UI::WindowsAndMessaging::{EnumWindows, GetWindowThreadProcessId, IsWindowVisible},
    };
    unsafe extern "system" fn collect(hwnd: HWND, parameter: LPARAM) -> i32 {
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 || pid == std::process::id() {
            return 1;
        }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return 1;
        }
        let mut buffer = [0u16; 1024];
        let mut length = buffer.len() as u32;
        let succeeded = QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut length);
        CloseHandle(process);
        if succeeded != 0 && length > 0 {
            let name = basename(&String::from_utf16_lossy(&buffer[..length as usize]));
            if allowed_application(&name) {
                (&mut *(parameter as *mut Vec<String>)).push(name);
            }
        }
        1
    }
    let mut names = Vec::<String>::new();
    unsafe {
        EnumWindows(Some(collect), &mut names as *mut _ as isize);
    }
    names.sort();
    names.dedup();
    names
        .into_iter()
        .map(|executable| RunningApplication {
            display_name: executable.trim_end_matches(".exe").replace(['-', '_'], " "),
            executable,
        })
        .collect()
}

#[cfg(not(windows))]
pub fn running_applications() -> Vec<RunningApplication> {
    Vec::new()
}

fn catalog() -> &'static [Game] {
    static CATALOG: OnceLock<Vec<Game>> = OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../../../packages/types/src/game-catalog.json"
        ))
        .expect("bundled game catalog must be valid")
    })
}

fn basename(value: &str) -> String {
    value
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn identify(name: &str, args: &[String]) -> Option<&'static str> {
    let name = basename(name);
    if let Some(game) = catalog()
        .iter()
        .find(|game| game.executables.contains(&name))
    {
        return Some(&game.id);
    }
    // Java itself and launchers are not games. Never publish command lines or paths.
    if ["java", "javaw", "java.exe", "javaw.exe"].contains(&name.as_str()) {
        let client_class = args.iter().any(|arg| {
            matches!(
                arg.as_str(),
                "net.minecraft.client.main.Main"
                    | "net.fabricmc.loader.impl.launch.knot.KnotClient"
                    | "net.fabricmc.loader.launch.knot.KnotClient"
                    | "org.quiltmc.loader.impl.launch.knot.KnotClient"
            )
        });
        let forge_client = args.windows(2).any(|pair| {
            pair[0] == "--launchTarget"
                && ["forgeclient", "neoforgeclient"].contains(&pair[1].as_str())
        });
        let legacy_client = args
            .iter()
            .any(|arg| arg == "net.minecraft.launchwrapper.Launch")
            && args.windows(2).any(|pair| {
                pair[0] == "--tweakClass"
                    && [
                        "net.minecraftforge.fml.common.launcher.FMLTweaker",
                        "cpw.mods.fml.common.launcher.FMLTweaker",
                        "optifine.OptiFineTweaker",
                    ]
                    .contains(&pair[1].as_str())
            });
        if client_class || forge_client || legacy_client {
            return Some("minecraft");
        }
    }
    None
}

pub fn identify_executable(name: &str) -> Option<String> {
    identify(name, &[]).map(str::to_owned)
}

fn detect(registered: &[RegisteredGame]) -> Option<String> {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .without_tasks()
            .with_exe(UpdateKind::OnlyIfNotSet),
    );
    let java_ids: Vec<_> = system
        .processes()
        .iter()
        .filter_map(|(pid, process)| {
            let name = basename(&process.name().to_string_lossy());
            ["java", "javaw", "java.exe", "javaw.exe"]
                .contains(&name.as_str())
                .then_some(*pid)
        })
        .collect();
    if !java_ids.is_empty() {
        system.refresh_processes_specifics(
            ProcessesToUpdate::Some(&java_ids),
            true,
            ProcessRefreshKind::nothing()
                .without_tasks()
                .with_cmd(UpdateKind::OnlyIfNotSet),
        );
    }
    system
        .processes()
        .values()
        .filter_map(|process| {
            let name = process
                .exe()
                .and_then(|path| path.file_name())
                .unwrap_or_else(|| process.name())
                .to_string_lossy();
            let args: Vec<_> = process
                .cmd()
                .iter()
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect();
            identify(&name, &args)
                .or_else(|| identify(&process.name().to_string_lossy(), &args))
                .map(str::to_owned)
                .or_else(|| identify_registered(&name, registered))
                .map(|id| (process.start_time(), id))
        })
        .max_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)))
        .map(|(_, id)| id.to_owned())
}

pub fn detect_cached(registered: &[RegisteredGame]) -> Result<Option<String>, String> {
    use std::{
        sync::Mutex,
        time::{Duration, Instant},
    };
    static CACHE: Mutex<Option<(Instant, Vec<RegisteredGame>, Option<String>)>> = Mutex::new(None);
    let mut cache = CACHE
        .lock()
        .map_err(|_| "Game detection unavailable.".to_string())?;
    if let Some((at, previous, game)) = &*cache {
        if previous == registered && at.elapsed() < Duration::from_secs(15) {
            return Ok(game.clone());
        }
    }
    let game = detect(registered);
    *cache = Some((Instant::now(), registered.to_vec(), game.clone()));
    Ok(game)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registered_games_are_local_bounded_and_deterministic() {
        let input = RegisteredGame {
            id: "untrusted".into(),
            executable: "mygame.exe".into(),
            label: "My game".into(),
        };
        let result = validate_registered(&[input.clone()]).unwrap();
        assert!(result[0].id.starts_with("custom:"));
        assert_eq!(result[0].id.len(), 19);
        assert_eq!(
            identify_registered("mygame.exe", &result),
            Some(result[0].id.clone())
        );
        assert!(validate_registered(&vec![input; 65]).is_err());
        assert!(!allowed_application("steam.exe"));
        assert!(!allowed_application("../game.exe"));
    }

    #[test]
    fn recognizes_catalog_on_all_platforms_without_launchers() {
        for game in catalog() {
            for executable in &game.executables {
                assert_eq!(
                    identify(&format!("C:\\Games\\{}", executable.to_uppercase()), &[]),
                    Some(game.id.as_str())
                );
                assert_eq!(
                    identify(&format!("/games/{executable}"), &[]),
                    Some(game.id.as_str())
                );
            }
        }
        for launcher in [
            "steam.exe",
            "riotclientservices.exe",
            "minecraftlauncher.exe",
            "epicgameslauncher.exe",
            "javaw.exe",
        ] {
            assert_eq!(identify(launcher, &[]), None);
        }
    }

    #[test]
    fn distinguishes_minecraft_client_from_java_servers() {
        assert_eq!(
            identify("javaw.exe", &["net.minecraft.client.main.Main".into()]),
            Some("minecraft")
        );
        assert_eq!(
            identify(
                "java",
                &["net.fabricmc.loader.impl.launch.knot.KnotClient".into()]
            ),
            Some("minecraft")
        );
        assert_eq!(
            identify("java", &["--launchTarget".into(), "forgeclient".into()]),
            Some("minecraft")
        );
        assert_eq!(
            identify("java", &["net.minecraft.server.Main".into()]),
            None
        );
        assert_eq!(
            identify("java", &["--launchTarget".into(), "forgeserver".into()]),
            None
        );
    }
}
