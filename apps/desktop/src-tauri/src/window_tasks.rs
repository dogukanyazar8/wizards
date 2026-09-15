use std::sync::{Arc, Mutex};

/// Serializes dynamic window creation without blocking Tauri's event loop.
/// Only worker threads acquire this lock; window events must never acquire it.
#[derive(Clone, Default)]
pub(crate) struct DesktopWindowTasks {
    gate: Arc<Mutex<()>>,
}

impl DesktopWindowTasks {
    pub(crate) async fn run<T, F>(&self, task: F) -> Result<T, String>
    where
        T: Send + 'static,
        F: FnOnce() -> Result<T, String> + Send + 'static,
    {
        let gate = self.gate.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let _guard = gate
                .lock()
                .map_err(|_| "Desktop window task lock is unavailable.".to_string())?;
            task()
        })
        .await
        .map_err(|error| format!("Desktop window task failed: {error}"))?
    }
}

#[cfg(test)]
mod tests {
    use super::DesktopWindowTasks;
    use std::sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Barrier,
    };

    #[test]
    fn window_creation_runs_off_the_calling_thread() {
        let caller = std::thread::current().id();
        let tasks = DesktopWindowTasks::default();
        let worker =
            tauri::async_runtime::block_on(tasks.run(move || Ok(std::thread::current().id())))
                .unwrap();
        assert_ne!(caller, worker);
    }

    #[test]
    fn concurrent_requests_reuse_a_single_created_window() {
        let tasks = DesktopWindowTasks::default();
        let ready = Arc::new(Barrier::new(8));
        let exists = Arc::new(AtomicBool::new(false));
        let created = Arc::new(AtomicUsize::new(0));
        let mut requests = Vec::new();
        for _ in 0..8 {
            let tasks = tasks.clone();
            let ready = ready.clone();
            let exists = exists.clone();
            let created = created.clone();
            requests.push(std::thread::spawn(move || {
                ready.wait();
                tauri::async_runtime::block_on(tasks.run(move || {
                    if !exists.load(Ordering::SeqCst) {
                        std::thread::yield_now();
                        created.fetch_add(1, Ordering::SeqCst);
                        exists.store(true, Ordering::SeqCst);
                    }
                    Ok(())
                }))
            }));
        }
        for request in requests {
            request.join().unwrap().unwrap();
        }
        assert_eq!(created.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_failed_open_is_returned_and_does_not_block_the_next_request() {
        let tasks = DesktopWindowTasks::default();
        let error = tauri::async_runtime::block_on(
            tasks.run(|| Err::<(), _>("window creation failed".to_string())),
        );
        assert_eq!(error, Err("window creation failed".to_string()));
        assert_eq!(tauri::async_runtime::block_on(tasks.run(|| Ok(42))), Ok(42));
    }
}
