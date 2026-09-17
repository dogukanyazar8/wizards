pub fn labels(locale: &str, _muted: bool, _deafened: bool) -> [&'static str; 3] {
    if locale == "tr" {
        ["Whispr'ı aç", "Ayarlar", "Whispr'ı kapat"]
    } else {
        ["Open Whispr", "Settings", "Close Whispr"]
    }
}

#[cfg(test)]
mod tests {
    use super::labels;

    #[test]
    fn menu_labels_are_localized_and_limited_to_three_actions() {
        assert_eq!(
            labels("tr", true, true),
            ["Whispr'ı aç", "Ayarlar", "Whispr'ı kapat"]
        );
        assert_eq!(
            labels("en", false, false),
            ["Open Whispr", "Settings", "Close Whispr"]
        );
    }

    #[test]
    fn voice_state_does_not_change_the_three_menu_actions() {
        assert_eq!(labels("en", false, false), labels("en", true, true));
    }
}
