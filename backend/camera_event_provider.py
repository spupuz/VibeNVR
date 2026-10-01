"""Provider-neutral camera event contract and per-camera state transitions."""
from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class CameraEvent:
    camera_id: int
    event_type: str
    state: str
    source: str
    labels: tuple[str, ...] = ()
    timestamp: Optional[str] = None
    channel: Optional[str] = None
    rule: Optional[str] = None
    region: Optional[str] = None
    provider_event_type: Optional[str] = None

    @property
    def triggers_motion(self):
        return self.event_type == "motion" and self.state in ("active", "inactive")

    def engine_payload(self):
        return {
            "event_type": self.event_type, "state": self.state,
            "source": self.source, "labels": list(self.labels),
            "timestamp": self.timestamp, "channel": self.channel,
            "rule": self.rule, "region": self.region,
            "provider_event_type": self.provider_event_type,
        }


@dataclass
class EventLifecycle:
    timeout: float = 30.0
    active: bool = False
    last_seen: float = 0.0
    labels: set[str] = field(default_factory=set)

    def accept(self, event: CameraEvent, now: float):
        if not event.triggers_motion:
            return None
        if event.state == "inactive":
            if not self.active:
                return None
            self.active = False
            self.labels.clear()
            return "end"
        self.last_seen = now
        self.labels.update(event.labels)
        if self.active:
            return "update"
        self.active = True
        return "start"

    def expired(self, now: float):
        if self.active and now - self.last_seen > self.timeout:
            self.active = False
            self.labels.clear()
            return True
        return False


def selected_provider(camera):
    """Existing ONVIF Edge cameras retain their selection after migration."""
    return camera.event_provider or ("onvif" if camera.detect_engine == "ONVIF Edge" else "server")
