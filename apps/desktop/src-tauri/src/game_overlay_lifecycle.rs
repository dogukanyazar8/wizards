/// Tracks one companion document without holding a lock across native window calls.
#[derive(Default)]
pub(crate) struct CompanionSurfaceLifecycle {
    generation: u64,
    requested: bool,
    ready: bool,
}

impl CompanionSurfaceLifecycle {
    pub(crate) fn request_visibility(&mut self, visible: bool) {
        self.requested = visible;
    }

    pub(crate) fn requested(&self) -> bool {
        self.requested
    }

    pub(crate) fn begin_load(&mut self) -> u64 {
        self.generation = self.generation.wrapping_add(1);
        self.ready = false;
        self.generation
    }

    pub(crate) fn loading(&mut self, generation: u64) {
        if generation == self.generation {
            self.ready = false;
        }
    }

    pub(crate) fn loaded(&mut self, generation: u64) -> bool {
        if generation != self.generation {
            return false;
        }
        self.ready = true;
        self.can_show()
    }

    pub(crate) fn can_show(&self) -> bool {
        self.requested && self.ready
    }

    pub(crate) fn closed(&mut self) {
        // Closing a document must not overwrite a newer visibility request.
        self.begin_load();
    }
}

#[cfg(test)]
mod tests {
    use super::CompanionSurfaceLifecycle;

    #[test]
    fn creation_and_navigation_stay_hidden_until_loaded() {
        let mut state = CompanionSurfaceLifecycle::default();
        state.request_visibility(true);
        let generation = state.begin_load();
        assert!(!state.can_show());
        assert!(state.loaded(generation));
        state.loading(generation);
        assert!(!state.can_show());
        assert!(state.loaded(generation));
    }

    #[test]
    fn a_late_load_cannot_reopen_a_hidden_window() {
        let mut state = CompanionSurfaceLifecycle::default();
        state.request_visibility(true);
        let generation = state.begin_load();
        state.request_visibility(false);
        assert!(!state.loaded(generation));
        assert!(!state.can_show());
    }

    #[test]
    fn completing_an_old_close_preserves_a_newer_show_request() {
        let mut state = CompanionSurfaceLifecycle::default();
        state.request_visibility(true);
        let old = state.begin_load();
        assert!(state.loaded(old));
        state.request_visibility(false);
        // The hide worker has started; a newer request arrives before close completes.
        state.request_visibility(true);
        state.closed();
        assert!(state.requested());
        assert!(!state.can_show());
        let replacement = state.begin_load();
        assert!(!state.loaded(old));
        assert!(state.loaded(replacement));
    }

    #[test]
    fn a_hidden_loaded_document_can_be_shown_without_reloading() {
        let mut state = CompanionSurfaceLifecycle::default();
        state.request_visibility(true);
        let document = state.begin_load();
        state.request_visibility(false);
        assert!(!state.loaded(document));
        state.request_visibility(true);
        assert!(state.can_show());
    }

    #[test]
    fn events_from_a_destroyed_document_cannot_show_its_replacement() {
        let mut state = CompanionSurfaceLifecycle::default();
        state.request_visibility(true);
        let old = state.begin_load();
        state.closed();
        state.request_visibility(true);
        let current = state.begin_load();
        assert!(!state.loaded(old));
        assert!(state.loaded(current));
        state.loading(old);
        assert!(state.can_show());
    }
}
