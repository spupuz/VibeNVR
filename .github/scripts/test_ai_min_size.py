import pytest
from unittest.mock import MagicMock, patch
import numpy as np

# Test 1: Schemas and validation
from schemas import CameraBase, CameraUpdate, Camera
import schemas

def test_schemas_ai_min_size_validation():
    # Default value
    cam = CameraBase(name="Test Cam", rtsp_url="rtsp://example.com/live")
    assert cam.ai_min_size == 0.0

    # Valid float
    cam2 = CameraBase(name="Test Cam 2", rtsp_url="rtsp://example.com/live", ai_min_size=0.025)
    assert cam2.ai_min_size == 0.025

    # String conversion
    cam3 = CameraBase(name="Test Cam 3", rtsp_url="rtsp://example.com/live", ai_min_size="0.05")
    assert cam3.ai_min_size == 0.05

    # Clamping negative values
    cam4 = CameraBase(name="Test Cam 4", rtsp_url="rtsp://example.com/live", ai_min_size=-0.2)
    assert cam4.ai_min_size == 0.0

    # Clamping excess values
    cam5 = CameraBase(name="Test Cam 5", rtsp_url="rtsp://example.com/live", ai_min_size=1.5)
    assert cam5.ai_min_size == 1.0

    # Non-numeric fallback
    cam6 = CameraBase(name="Test Cam 6", rtsp_url="rtsp://example.com/live", ai_min_size="invalid")
    assert cam6.ai_min_size == 0.0

    # CameraUpdate schema
    update = CameraUpdate(ai_min_size=0.03)
    assert update.ai_min_size == 0.03

# Test 2: Motion service config serialization
def test_motion_service_config_serialization():
    from motion_service import camera_to_config
    
    cam = MagicMock()
    cam.id = 1
    cam.name = "Front Door"
    cam.rtsp_url = "rtsp://camera.local/live"
    cam.sub_rtsp_url = None
    cam.framerate = 20
    cam.resolution_width = 1920
    cam.resolution_height = 1080
    cam.text_left = ""
    cam.text_right = ""
    cam.text_scale = 1.0
    cam.rotation = 0
    cam.recording_mode = "Continuous"
    cam.captured_before = 0
    cam.captured_after = 0
    cam.movie_quality = 75
    cam.movie_passthrough = False
    cam.max_movie_length = 0
    cam.record_audio = False
    cam.movie_file_name = "%Y-%m-%d/%H-%M-%S"
    cam.picture_quality = 75
    cam.picture_recording_mode = "Manual"
    cam.picture_file_name = "%Y-%m-%d/%H-%M-%S-%q"
    cam.threshold = 1500
    cam.motion_gap = 10
    cam.min_motion_frames = 2
    cam.despeckle_filter = False
    cam.detect_motion_mode = "Always"
    cam.detect_engine = "OpenCV"
    cam.event_provider = "server"
    cam.privacy_masks = "[]"
    cam.motion_masks = "[]"
    cam.ptz_can_pan_tilt = True
    cam.ptz_can_zoom = True
    cam.rtsp_transport = "tcp"
    cam.sub_rtsp_transport = "tcp"
    cam.live_view_mode = "auto"
    cam.audio_enabled = False
    cam.enable_audio = False
    cam.storage_profile = None
    cam.ai_enabled = True
    cam.ai_object_types = '["person"]'
    cam.ai_threshold = 0.5
    cam.ai_min_size = 0.02
    cam.ai_tracking_enabled = False

    config = camera_to_config(cam, opt_settings={})
    assert "ai_min_size" in config
    assert config["ai_min_size"] == 0.02

    # None fallback to 0.0
    cam.ai_min_size = None
    config_none = camera_to_config(cam, opt_settings={})
    assert config_none["ai_min_size"] == 0.0

# Test 3: Engine AI detector post-processing filter
def test_ai_detector_min_size_filtering():
    import sys
    sys.path.insert(0, "engine")
    from ai_detector import AIDetector

    detector = AIDetector.__new__(AIDetector)
    detector._initialized = True
    detector.labels = {0: "person", 2: "car"}
    detector.model_type = "mobilenet_ssd_v2"
    detector.hardware = "cpu"
    detector._enabled = True
    detector.output_details = [{'index': 0}, {'index': 1}, {'index': 2}, {'index': 3}]

    # Mock raw outputs:
    # 2 boxes:
    # Box 0: Tiny false positive (h=0.02, w=0.02, area = 0.0004 = 0.04% of frame)
    # Box 1: Real object (h=0.4, w=0.2, area = 0.08 = 8% of frame)
    boxes = np.array([[[0.50, 0.50, 0.52, 0.52], [0.10, 0.20, 0.50, 0.40]]], dtype=np.float32)
    classes = np.array([[0.0, 0.0]], dtype=np.float32)
    scores = np.array([[0.85, 0.90]], dtype=np.float32)
    count = np.array([2.0], dtype=np.float32)
    raw_outputs = [boxes, classes, scores, count]

    # Case A: ai_min_size = 0.01 (1% area minimum)
    # Box 0 (0.04%) should be filtered out, Box 1 (8%) should pass
    config_with_filter = {
        "ai_threshold": 0.5,
        "ai_min_size": 0.01,
        "ai_object_types": ["person"]
    }

    current_config = config_with_filter
    threshold = current_config.get('ai_threshold', 0.5)
    min_size = float(current_config.get('ai_min_size', 0.0) or 0.0)
    allowed_objects = current_config.get('ai_object_types', ["person"])
    vehicle_classes = ["car", "truck", "bus", "motorcycle"]

    results = []
    b_out   = raw_outputs[0][0]
    c_out   = raw_outputs[1][0]
    s_out   = raw_outputs[2][0]
    cnt_out = int(raw_outputs[3][0])
    for i in range(cnt_out):
        score = float(s_out[i])
        if score >= threshold:
            class_id = int(c_out[i])
            label = detector.labels.get(class_id, "unknown")
            if label in allowed_objects or ("vehicle" in allowed_objects and label in vehicle_classes):
                ymin, xmin, ymax, xmax = float(b_out[i][0]), float(b_out[i][1]), float(b_out[i][2]), float(b_out[i][3])
                box_area = max(0.0, xmax - xmin) * max(0.0, ymax - ymin)
                if min_size > 0.0 and box_area < min_size:
                    continue
                results.append({"label": label, "score": score, "box": [round(ymin, 2), round(xmin, 2), round(ymax, 2), round(xmax, 2)], "area": round(box_area, 5)})

    assert len(results) == 1
    assert results[0]["box"] == [0.10, 0.20, 0.50, 0.40]
    assert results[0]["area"] == pytest.approx(0.08, abs=1e-4)

    # Case B: ai_min_size = 0.0 (disabled)
    # Both boxes should pass
    min_size_disabled = 0.0
    results_all = []
    for i in range(cnt_out):
        score = float(s_out[i])
        if score >= threshold:
            class_id = int(c_out[i])
            label = detector.labels.get(class_id, "unknown")
            if label in allowed_objects or ("vehicle" in allowed_objects and label in vehicle_classes):
                ymin, xmin, ymax, xmax = float(b_out[i][0]), float(b_out[i][1]), float(b_out[i][2]), float(b_out[i][3])
                box_area = max(0.0, xmax - xmin) * max(0.0, ymax - ymin)
                if min_size_disabled > 0.0 and box_area < min_size_disabled:
                    continue
                results_all.append({"label": label, "score": score, "box": [round(ymin, 2), round(xmin, 2), round(ymax, 2), round(xmax, 2)], "area": round(box_area, 5)})

    assert len(results_all) == 2

