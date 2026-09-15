use std::sync::atomic::{AtomicBool, Ordering};
use tauri::WebviewWindow;
use windows::{
    core::Interface,
    Graphics::Capture::{GraphicsCapturePicker, GraphicsCaptureSession},
    Win32::{Foundation::E_POINTER, UI::Shell::IInitializeWithWindow},
};

static PICKER_OPEN: AtomicBool = AtomicBool::new(false);
struct PickerGuard;
impl PickerGuard {
    fn acquire() -> Result<Self, String> {
        PICKER_OPEN
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| Self)
            .map_err(|_| "A screen picker is already open.".into())
    }
}
impl Drop for PickerGuard {
    fn drop(&mut self) {
        PICKER_OPEN.store(false, Ordering::Release);
    }
}

/// Consent test only: the selected item is released without capturing or publishing frames.
pub async fn test(window: WebviewWindow) -> Result<bool, String> {
    let _guard = PickerGuard::acquire()?;
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    let owner = window.clone();
    window
        .run_on_main_thread(move || {
            let operation = (|| -> windows::core::Result<_> {
                if !GraphicsCaptureSession::IsSupported()? {
                    return Err(windows::core::Error::from_hresult(windows::core::HRESULT(
                        0x80004001u32 as i32,
                    )));
                }
                let picker = GraphicsCapturePicker::new()?;
                let hwnd = owner
                    .hwnd()
                    .map_err(|_| windows::core::Error::from_hresult(E_POINTER))?;
                unsafe {
                    picker.cast::<IInitializeWithWindow>()?.Initialize(hwnd)?;
                }
                picker.PickSingleItemAsync()
            })();
            match operation {
                Ok(operation) => {
                    tauri::async_runtime::spawn_blocking(move || {
                        let result = match operation.get() {
                            Ok(_item) => Ok(true),
                            Err(error) if error.code() == E_POINTER => Ok(false),
                            Err(error) => {
                                eprintln!("Whispr screen picker failed: {error}");
                                Err("Screen selection could not be completed.".into())
                            }
                        };
                        let _ = tx.blocking_send(result);
                    });
                }
                Err(error) => {
                    eprintln!("Whispr screen picker unavailable: {error}");
                    let _ =
                        tx.try_send(Err("Screen selection is unavailable on this device.".into()));
                }
            }
        })
        .map_err(|_| "Screen selection could not be opened.".to_string())?;
    rx.recv()
        .await
        .ok_or_else(|| "Screen selection was interrupted.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_one_picker_may_be_open_and_cancellation_releases_the_gate() {
        let guard = PickerGuard::acquire().unwrap();
        assert!(PickerGuard::acquire().is_err());
        drop(guard);
        assert!(PickerGuard::acquire().is_ok());
    }
}
