use serde::Deserialize;
use std::sync::OnceLock;

#[derive(Deserialize)]
struct Game {
    id: String,
    executables: Vec<String>,
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

fn detect() -> Option<String> {
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
                .map(|id| (process.start_time(), id))
        })
        .max_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(b.1)))
        .map(|(_, id)| id.to_owned())
}

pub fn detect_cached() -> Result<Option<String>, String> {
    use std::{
        sync::Mutex,
        time::{Duration, Instant},
    };
    static CACHE: Mutex<Option<(Instant, Option<String>)>> = Mutex::new(None);
    let mut cache = CACHE
        .lock()
        .map_err(|_| "Game detection unavailable.".to_string())?;
    if let Some((at, game)) = &*cache {
        if at.elapsed() < Duration::from_secs(15) {
            return Ok(game.clone());
        }
    }
    let game = detect();
    *cache = Some((Instant::now(), game.clone()));
    Ok(game)
}

#[cfg(test)]
mod tests {
    use super::*;

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
