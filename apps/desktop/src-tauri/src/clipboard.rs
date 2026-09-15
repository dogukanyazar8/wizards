use tauri::WebviewWindow;
use windows::Win32::{
    Foundation::HGLOBAL,
    System::{
        DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard},
        Memory::{GlobalLock, GlobalSize, GlobalUnlock},
    },
};
struct ClipboardGuard;
impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        let _ = unsafe { CloseClipboard() };
    }
}
struct MemoryGuard(HGLOBAL);
impl Drop for MemoryGuard {
    fn drop(&mut self) {
        let _ = unsafe { GlobalUnlock(self.0) };
    }
}

/// Text-only, bounded paste for a direct Whispr action. No clipboard contents are logged.
pub fn read_text(window: &WebviewWindow) -> Result<String, String> {
    let owner = window
        .hwnd()
        .map_err(|_| "The application window is unavailable.")?;
    unsafe { OpenClipboard(Some(owner)) }.map_err(|_| "The clipboard is busy.")?;
    let _clipboard = ClipboardGuard;
    const UNICODE_TEXT_FORMAT: u32 = 13;
    let handle = unsafe { GetClipboardData(UNICODE_TEXT_FORMAT) }
        .map_err(|_| "Clipboard text is unavailable.")?;
    let memory = HGLOBAL(handle.0);
    let size = unsafe { GlobalSize(memory) };
    if size == 0 || size > 131_072 || size % 2 != 0 {
        return Err("Clipboard text is too large or invalid.".into());
    }
    let data = unsafe { GlobalLock(memory) };
    if data.is_null() {
        return Err("Clipboard text could not be read.".into());
    }
    let _memory = MemoryGuard(memory);
    let units = unsafe { std::slice::from_raw_parts(data.cast::<u16>(), size / 2) };
    decode_text(units)
}

fn decode_text(units: &[u16]) -> Result<String, String> {
    if units.len() > 65_536 {
        return Err("Clipboard text is too large.".into());
    }
    let end = units
        .iter()
        .position(|unit| *unit == 0)
        .ok_or("Clipboard text is invalid.")?;
    String::from_utf16(&units[..end]).map_err(|_| "Clipboard text is invalid.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paste_is_bounded_valid_unicode_and_stops_at_the_terminator() {
        assert_eq!(decode_text(&[0x57, 0x131, 0, 0x44]).unwrap(), "Wı");
        assert!(decode_text(&[0xD800, 0]).is_err());
        assert!(decode_text(&[65]).is_err());
        assert!(decode_text(&vec![0; 65_537]).is_err());
    }
}
