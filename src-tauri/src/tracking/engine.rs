use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActivityState {
    Active,
    BackgroundGrace,
    Paused,
}

#[derive(Debug, Clone)]
pub struct ActivityAccumulator {
    credited: Duration,
    unfocused_for: Duration,
    background_grace: Duration,
}

impl ActivityAccumulator {
    pub fn new(background_grace: Duration) -> Self {
        Self {
            credited: Duration::ZERO,
            unfocused_for: Duration::ZERO,
            background_grace,
        }
    }

    pub fn add(&mut self, delta: Duration, focused: bool) -> ActivityState {
        if focused {
            self.credited = self.credited.saturating_add(delta);
            self.unfocused_for = Duration::ZERO;
            return ActivityState::Active;
        }

        let grace_left = self.background_grace.saturating_sub(self.unfocused_for);
        let credited_delta = delta.min(grace_left);
        self.credited = self.credited.saturating_add(credited_delta);
        self.unfocused_for = self.unfocused_for.saturating_add(delta);

        if self.unfocused_for >= self.background_grace {
            ActivityState::Paused
        } else {
            ActivityState::BackgroundGrace
        }
    }

    pub fn credited_seconds(&self) -> i64 {
        self.credited.as_secs().min(i64::MAX as u64) as i64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn focused_time_is_credited_in_full() {
        let mut timing = ActivityAccumulator::new(Duration::from_secs(90));
        assert_eq!(
            timing.add(Duration::from_secs(120), true),
            ActivityState::Active
        );
        assert_eq!(timing.credited_seconds(), 120);
    }

    #[test]
    fn short_alt_tab_uses_grace_and_resumes_normally() {
        let mut timing = ActivityAccumulator::new(Duration::from_secs(90));
        timing.add(Duration::from_secs(60), true);
        assert_eq!(
            timing.add(Duration::from_secs(30), false),
            ActivityState::BackgroundGrace
        );
        assert_eq!(
            timing.add(Duration::from_secs(15), true),
            ActivityState::Active
        );
        assert_eq!(timing.credited_seconds(), 105);
    }

    #[test]
    fn long_background_time_pauses_after_the_grace_window() {
        let mut timing = ActivityAccumulator::new(Duration::from_secs(90));
        assert_eq!(
            timing.add(Duration::from_secs(120), false),
            ActivityState::Paused
        );
        assert_eq!(timing.credited_seconds(), 90);
        assert_eq!(
            timing.add(Duration::from_secs(300), false),
            ActivityState::Paused
        );
        assert_eq!(timing.credited_seconds(), 90);
    }

    #[test]
    fn returning_to_the_game_resumes_the_same_session() {
        let mut timing = ActivityAccumulator::new(Duration::from_secs(60));
        timing.add(Duration::from_secs(180), false);
        assert_eq!(timing.credited_seconds(), 60);
        assert_eq!(
            timing.add(Duration::from_secs(40), true),
            ActivityState::Active
        );
        assert_eq!(timing.credited_seconds(), 100);
    }
}
