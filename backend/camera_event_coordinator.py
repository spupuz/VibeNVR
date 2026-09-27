"""Start only the selected camera-native event provider for each camera."""

from camera_event_provider import selected_provider
from database import SessionLocal
import models
from hikvision_event_service import event_manager as hikvision_manager
from onvif_event_service import event_manager as onvif_manager


class CameraEventCoordinator:
    def __init__(self, onvif=onvif_manager, hikvision=hikvision_manager):
        self.onvif = onvif
        self.hikvision = hikvision

    def start(self):
        self.onvif.start()

    def bootstrap(self):
        self.hikvision.bootstrap()

    def stop(self):
        self.onvif.stop()
        self.hikvision.stop()

    def update_subscription(self, camera_id):
        db = SessionLocal()
        try:
            camera = db.get(models.Camera, camera_id)
            provider = selected_provider(camera) if camera and camera.is_active else None
        finally:
            db.close()

        # ONVIF owns cancellation of its existing PullPoint task.
        self.onvif.update_subscription(camera_id)
        if provider == "hikvision_isapi":
            self.hikvision.update_subscription(camera_id)
        else:
            self.hikvision.stop_camera(camera_id)


event_coordinator = CameraEventCoordinator()
