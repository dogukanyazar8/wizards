use serde::{de::Error as _, Deserialize, Deserializer, Serialize};
use url::Url;

const DESKTOP_COMPANION_SNAPSHOT_VERSION: u8 = 1;
const MAX_DESKTOP_COMPANION_PARTICIPANTS: usize = 12;
const MAX_DESKTOP_COMPANION_AUDIO_LEVEL: f64 = 1.0;
const MAX_DESKTOP_COMPANION_AVATAR_URL_CHARS: usize = 2_048;
const MAX_DESKTOP_COMPANION_DISPLAY_NAME_CHARS: usize = 80;
const MAX_DESKTOP_COMPANION_RTT_MS: u32 = 60_000;
const MAX_DESKTOP_COMPANION_USER_ID_CHARS: usize = 128;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopCompanionSnapshotV1 {
    version: u8,
    active: bool,
    connection: DesktopCompanionConnection,
    overlay: Option<DesktopCompanionOverlay>,
    participants: Vec<DesktopCompanionParticipant>,
    privacy_mode: Option<DesktopCompanionPrivacyMode>,
    updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DesktopCompanionSnapshotWireV1 {
    #[serde(default = "default_snapshot_version")]
    version: u8,
    active: bool,
    connection: DesktopCompanionConnection,
    overlay: Option<DesktopCompanionOverlay>,
    participants: Vec<DesktopCompanionParticipant>,
    privacy_mode: Option<DesktopCompanionPrivacyMode>,
    updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DesktopCompanionConnection {
    quality: DesktopCompanionConnectionQuality,
    rtt_ms: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DesktopCompanionOverlay {
    anchor: DesktopCompanionOverlayAnchor,
    size: DesktopCompanionOverlaySize,
    speaking_only: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DesktopCompanionParticipant {
    audio_level: f64,
    avatar_url: Option<String>,
    display_name: String,
    is_deafened: bool,
    is_local: bool,
    is_muted: bool,
    is_speaking: bool,
    user_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum DesktopCompanionConnectionQuality {
    Excellent,
    Good,
    Poor,
    Lost,
    Unknown,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
enum DesktopCompanionOverlayAnchor {
    BottomLeft,
    BottomRight,
    TopLeft,
    TopRight,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum DesktopCompanionOverlaySize {
    Compact,
    Normal,
    Large,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum DesktopCompanionPrivacyMode {
    Standard,
    Streamer,
}

#[derive(Debug, Clone, Copy)]
enum DesktopCompanionSnapshotValidationError {
    Bounds,
    Timestamp,
    Version,
}

impl<'de> Deserialize<'de> for DesktopCompanionSnapshotV1 {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let wire = DesktopCompanionSnapshotWireV1::deserialize(deserializer)
            .map_err(|_| D::Error::custom("Invalid desktop companion snapshot."))?;

        Self::try_from(wire).map_err(|_| D::Error::custom("Invalid desktop companion snapshot."))
    }
}

impl TryFrom<DesktopCompanionSnapshotWireV1> for DesktopCompanionSnapshotV1 {
    type Error = DesktopCompanionSnapshotValidationError;

    fn try_from(value: DesktopCompanionSnapshotWireV1) -> Result<Self, Self::Error> {
        if value.version != DESKTOP_COMPANION_SNAPSHOT_VERSION {
            return Err(DesktopCompanionSnapshotValidationError::Version);
        }

        if !is_valid_snapshot_timestamp(&value.updated_at) {
            return Err(DesktopCompanionSnapshotValidationError::Timestamp);
        }

        if value.participants.len() > MAX_DESKTOP_COMPANION_PARTICIPANTS
            || value
                .connection
                .rtt_ms
                .is_some_and(|rtt_ms| rtt_ms > MAX_DESKTOP_COMPANION_RTT_MS)
            || value
                .participants
                .iter()
                .any(|participant| !is_valid_participant(participant))
        {
            return Err(DesktopCompanionSnapshotValidationError::Bounds);
        }

        Ok(Self {
            version: value.version,
            active: value.active,
            connection: value.connection,
            overlay: value.overlay,
            participants: value.participants,
            privacy_mode: value.privacy_mode,
            updated_at: value.updated_at,
        })
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopCompanionSnapshotPublishResultV1 {
    delivered: bool,
    version: u8,
}

impl DesktopCompanionSnapshotPublishResultV1 {
    pub fn new(delivered: bool) -> Self {
        Self {
            delivered,
            version: DESKTOP_COMPANION_SNAPSHOT_VERSION,
        }
    }
}

fn default_snapshot_version() -> u8 {
    DESKTOP_COMPANION_SNAPSHOT_VERSION
}

fn is_valid_participant(participant: &DesktopCompanionParticipant) -> bool {
    participant.audio_level.is_finite()
        && (0.0..=MAX_DESKTOP_COMPANION_AUDIO_LEVEL).contains(&participant.audio_level)
        && is_bounded_nonempty_string(
            &participant.display_name,
            MAX_DESKTOP_COMPANION_DISPLAY_NAME_CHARS,
        )
        && is_bounded_nonempty_string(&participant.user_id, MAX_DESKTOP_COMPANION_USER_ID_CHARS)
        && participant
            .avatar_url
            .as_deref()
            .is_none_or(is_valid_avatar_url)
}

fn is_bounded_nonempty_string(value: &str, max_chars: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max_chars
}

fn is_valid_avatar_url(value: &str) -> bool {
    value.chars().count() <= MAX_DESKTOP_COMPANION_AVATAR_URL_CHARS
        && Url::parse(value)
            .map(|url| matches!(url.scheme(), "http" | "https"))
            .unwrap_or(false)
}

fn is_valid_snapshot_timestamp(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 24
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[19] != b'.'
        || bytes[23] != b'Z'
    {
        return false;
    }

    [0..4, 5..7, 8..10, 11..13, 14..16, 17..19, 20..23]
        .into_iter()
        .all(|range| bytes[range].iter().all(u8::is_ascii_digit))
}
