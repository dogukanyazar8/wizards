use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

const PROMPT_TTL_MS: u64 = 120_000;
const GRANT_TTL_MS: u64 = 15_000;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) enum DesktopMediaPermissionKind {
    Camera,
    Microphone,
}

impl DesktopMediaPermissionKind {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "camera" => Some(Self::Camera),
            "microphone" => Some(Self::Microphone),
            _ => None,
        }
    }

    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Camera => "camera",
            Self::Microphone => "microphone",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct DesktopMediaPermissionPrompt {
    pub(crate) request_id: String,
    pub(crate) kind: DesktopMediaPermissionKind,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct DesktopMediaPermissionResolution {
    pub(crate) allowed: bool,
    pub(crate) kind: DesktopMediaPermissionKind,
    pub(crate) request_id: String,
}

#[derive(Debug)]
struct PendingPrompt {
    expires_at_ms: u64,
    origin: String,
    prompt: DesktopMediaPermissionPrompt,
}

#[derive(Debug)]
struct PermissionGrant {
    expires_at_ms: u64,
    origin: String,
}

#[derive(Default, Debug)]
struct BrokerState {
    grants: HashMap<DesktopMediaPermissionKind, PermissionGrant>,
    next_request_id: u64,
    pending: Option<PendingPrompt>,
}

#[derive(Clone, Default, Debug)]
pub(crate) struct DesktopMediaPermissionBroker {
    state: Arc<Mutex<BrokerState>>,
}

impl DesktopMediaPermissionBroker {
    pub(crate) fn pending_prompt(&self, now_ms: u64) -> Option<DesktopMediaPermissionPrompt> {
        let Ok(mut state) = self.lock() else {
            return None;
        };
        clear_expired(&mut state, now_ms);
        state.pending.as_ref().map(|pending| pending.prompt.clone())
    }

    pub(crate) fn prepare(
        &self,
        kind: DesktopMediaPermissionKind,
        origin: &str,
        now_ms: u64,
    ) -> Result<DesktopMediaPermissionPrompt, String> {
        let mut state = self.lock()?;
        clear_expired(&mut state, now_ms);

        if state.pending.is_some() {
            return Err("Another desktop media permission request is already active.".to_string());
        }

        state.next_request_id = state.next_request_id.saturating_add(1);
        let prompt = DesktopMediaPermissionPrompt {
            request_id: format!("media-permission-{}", state.next_request_id),
            kind,
        };
        state.pending = Some(PendingPrompt {
            expires_at_ms: now_ms.saturating_add(PROMPT_TTL_MS),
            origin: origin.to_string(),
            prompt: prompt.clone(),
        });

        Ok(prompt)
    }

    pub(crate) fn resolve(
        &self,
        request_id: &str,
        allowed: bool,
        now_ms: u64,
    ) -> Result<DesktopMediaPermissionResolution, String> {
        let mut state = self.lock()?;
        clear_expired(&mut state, now_ms);

        let pending = state
            .pending
            .as_ref()
            .ok_or_else(|| "Desktop media permission request is missing or expired.".to_string())?;

        if pending.prompt.request_id != request_id {
            return Err("Desktop media permission request does not match.".to_string());
        }

        let pending = state
            .pending
            .take()
            .expect("pending desktop media permission was checked above");

        if allowed {
            state.grants.insert(
                pending.prompt.kind,
                PermissionGrant {
                    expires_at_ms: now_ms.saturating_add(GRANT_TTL_MS),
                    origin: pending.origin,
                },
            );
        }

        Ok(DesktopMediaPermissionResolution {
            allowed,
            kind: pending.prompt.kind,
            request_id: pending.prompt.request_id,
        })
    }

    pub(crate) fn consume_grant(
        &self,
        kind: DesktopMediaPermissionKind,
        origin: &str,
        now_ms: u64,
    ) -> bool {
        let Ok(mut state) = self.lock() else {
            return false;
        };
        clear_expired(&mut state, now_ms);

        if state
            .grants
            .get(&kind)
            .is_some_and(|grant| grant.origin == origin)
        {
            state.grants.remove(&kind);
            return true;
        }

        false
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, BrokerState>, String> {
        self.state
            .lock()
            .map_err(|_| "Desktop media permission state is unavailable.".to_string())
    }
}

fn clear_expired(state: &mut BrokerState, now_ms: u64) {
    if state
        .pending
        .as_ref()
        .is_some_and(|pending| pending.expires_at_ms < now_ms)
    {
        state.pending = None;
    }

    state
        .grants
        .retain(|_, grant| grant.expires_at_ms >= now_ms);
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum WebviewMediaPermissionState {
    Allow,
    Default,
    Deny,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum WebviewMediaPermissionDecision {
    AllowAndPersist,
    DenyAndPersist,
    DenyEphemeral,
    Ignore,
}

pub(crate) fn resolve_webview_media_permission(
    kind: Option<DesktopMediaPermissionKind>,
    same_origin: bool,
    saved_state: WebviewMediaPermissionState,
    has_local_grant: bool,
) -> WebviewMediaPermissionDecision {
    if kind.is_none() {
        return WebviewMediaPermissionDecision::Ignore;
    }

    if !same_origin {
        return WebviewMediaPermissionDecision::DenyEphemeral;
    }

    if has_local_grant {
        return WebviewMediaPermissionDecision::AllowAndPersist;
    }

    match saved_state {
        WebviewMediaPermissionState::Allow => WebviewMediaPermissionDecision::AllowAndPersist,
        WebviewMediaPermissionState::Deny => WebviewMediaPermissionDecision::DenyAndPersist,
        WebviewMediaPermissionState::Default => WebviewMediaPermissionDecision::DenyEphemeral,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        resolve_webview_media_permission, DesktopMediaPermissionBroker, DesktopMediaPermissionKind,
        WebviewMediaPermissionDecision, WebviewMediaPermissionState,
    };
    const NOW_MS: u64 = 10_000;
    const WHISPR_ORIGIN: &str = "https://whispr.team";

    #[test]
    fn pending_request_requires_the_exact_request_id() {
        let broker = DesktopMediaPermissionBroker::default();
        let prompt = broker
            .prepare(
                DesktopMediaPermissionKind::Microphone,
                WHISPR_ORIGIN,
                NOW_MS,
            )
            .expect("prompt");

        assert!(broker.resolve("wrong-request", true, NOW_MS + 1).is_err());
        assert_eq!(
            broker
                .resolve(&prompt.request_id, true, NOW_MS + 2)
                .expect("matching resolution")
                .kind,
            DesktopMediaPermissionKind::Microphone
        );
    }

    #[test]
    fn pending_prompt_is_visible_until_it_is_resolved() {
        let broker = DesktopMediaPermissionBroker::default();
        let prompt = broker
            .prepare(DesktopMediaPermissionKind::Camera, WHISPR_ORIGIN, NOW_MS)
            .expect("prompt");

        assert_eq!(broker.pending_prompt(NOW_MS + 1), Some(prompt.clone()));
        broker
            .resolve(&prompt.request_id, false, NOW_MS + 2)
            .expect("deny");
        assert_eq!(broker.pending_prompt(NOW_MS + 3), None);
    }

    #[test]
    fn pending_request_expires_without_creating_a_grant() {
        let broker = DesktopMediaPermissionBroker::default();
        let prompt = broker
            .prepare(DesktopMediaPermissionKind::Camera, WHISPR_ORIGIN, NOW_MS)
            .expect("prompt");

        assert!(broker
            .resolve(&prompt.request_id, true, NOW_MS + 120_001)
            .is_err());
        assert!(!broker.consume_grant(
            DesktopMediaPermissionKind::Camera,
            WHISPR_ORIGIN,
            NOW_MS + 120_002,
        ));
    }

    #[test]
    fn grant_matches_kind_and_origin_once() {
        let broker = DesktopMediaPermissionBroker::default();
        let prompt = broker
            .prepare(DesktopMediaPermissionKind::Camera, WHISPR_ORIGIN, NOW_MS)
            .expect("prompt");
        broker
            .resolve(&prompt.request_id, true, NOW_MS + 1)
            .expect("allow");

        assert!(!broker.consume_grant(
            DesktopMediaPermissionKind::Microphone,
            WHISPR_ORIGIN,
            NOW_MS + 2,
        ));
        assert!(!broker.consume_grant(
            DesktopMediaPermissionKind::Camera,
            "https://attacker.invalid",
            NOW_MS + 2,
        ));
        assert!(broker.consume_grant(
            DesktopMediaPermissionKind::Camera,
            WHISPR_ORIGIN,
            NOW_MS + 2,
        ));
        assert!(!broker.consume_grant(
            DesktopMediaPermissionKind::Camera,
            WHISPR_ORIGIN,
            NOW_MS + 3,
        ));
    }

    #[test]
    fn grant_expires_after_fifteen_seconds() {
        let broker = DesktopMediaPermissionBroker::default();
        let prompt = broker
            .prepare(
                DesktopMediaPermissionKind::Microphone,
                WHISPR_ORIGIN,
                NOW_MS,
            )
            .expect("prompt");
        broker
            .resolve(&prompt.request_id, true, NOW_MS + 1)
            .expect("allow");

        assert!(!broker.consume_grant(
            DesktopMediaPermissionKind::Microphone,
            WHISPR_ORIGIN,
            NOW_MS + 15_002,
        ));
    }

    #[test]
    fn denied_local_decision_never_creates_a_grant() {
        let broker = DesktopMediaPermissionBroker::default();
        let prompt = broker
            .prepare(DesktopMediaPermissionKind::Camera, WHISPR_ORIGIN, NOW_MS)
            .expect("prompt");
        broker
            .resolve(&prompt.request_id, false, NOW_MS + 1)
            .expect("deny");

        assert!(!broker.consume_grant(
            DesktopMediaPermissionKind::Camera,
            WHISPR_ORIGIN,
            NOW_MS + 2,
        ));
    }

    #[test]
    fn webview_permission_decision_is_exact_and_fail_closed() {
        assert_eq!(
            resolve_webview_media_permission(
                Some(DesktopMediaPermissionKind::Camera),
                true,
                WebviewMediaPermissionState::Default,
                true,
            ),
            WebviewMediaPermissionDecision::AllowAndPersist
        );
        assert_eq!(
            resolve_webview_media_permission(
                Some(DesktopMediaPermissionKind::Microphone),
                true,
                WebviewMediaPermissionState::Allow,
                false,
            ),
            WebviewMediaPermissionDecision::AllowAndPersist
        );
        assert_eq!(
            resolve_webview_media_permission(
                Some(DesktopMediaPermissionKind::Camera),
                true,
                WebviewMediaPermissionState::Deny,
                false,
            ),
            WebviewMediaPermissionDecision::DenyAndPersist
        );
        assert_eq!(
            resolve_webview_media_permission(
                Some(DesktopMediaPermissionKind::Camera),
                false,
                WebviewMediaPermissionState::Allow,
                true,
            ),
            WebviewMediaPermissionDecision::DenyEphemeral
        );
        assert_eq!(
            resolve_webview_media_permission(
                None,
                true,
                WebviewMediaPermissionState::Default,
                false,
            ),
            WebviewMediaPermissionDecision::Ignore
        );
    }
}
