use std::process::Command;

fn run_shell(command: &str) {
    // ruleid: rust.security.no-shell-command-string
    Command::new("sh").arg("-c").arg(command).status().unwrap();
}

fn run_executable() {
    // ok: rust.security.no-shell-command-string
    Command::new("git").args(["status", "--short"]).status().unwrap();
}
