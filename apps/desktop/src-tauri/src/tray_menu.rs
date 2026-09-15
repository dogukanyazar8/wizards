pub fn labels(locale: &str, muted: bool, deafened: bool) -> [&'static str; 7] {
    if locale == "tr" {
        [
            "Whispr'ı aç",
            if muted {
                "Mikrofonu aç"
            } else {
                "Mikrofonu kapat"
            },
            if deafened { "Sesi aç" } else { "Sesi kapat" },
            "Sesli sohbetten ayrıl",
            "Ayarlar",
            "Güncellemeler",
            "Whispr'dan çık",
        ]
    } else {
        [
            "Open Whispr",
            if muted {
                "Unmute microphone"
            } else {
                "Mute microphone"
            },
            if deafened { "Undeafen" } else { "Deafen" },
            "Leave voice chat",
            "Settings",
            "Updates",
            "Quit Whispr",
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::labels;

    #[test]
    fn voice_labels_describe_the_next_action_in_both_languages() {
        for (locale, mute, unmute, deafen, undeafen) in [
            (
                "tr",
                "Mikrofonu kapat",
                "Mikrofonu aç",
                "Sesi kapat",
                "Sesi aç",
            ),
            (
                "en",
                "Mute microphone",
                "Unmute microphone",
                "Deafen",
                "Undeafen",
            ),
        ] {
            for muted in [false, true] {
                for deafened in [false, true] {
                    let actual = labels(locale, muted, deafened);
                    assert_eq!(actual[1], if muted { unmute } else { mute });
                    assert_eq!(actual[2], if deafened { undeafen } else { deafen });
                    assert_eq!(actual[3], labels(locale, false, false)[3]);
                }
            }
        }
    }

    #[test]
    fn menu_keeps_only_seven_everyday_actions() {
        assert_eq!(
            labels("en", false, false),
            [
                "Open Whispr",
                "Mute microphone",
                "Deafen",
                "Leave voice chat",
                "Settings",
                "Updates",
                "Quit Whispr",
            ]
        );
    }
}
