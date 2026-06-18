import numpy as np
import logging
from engine.mask_handler import apply_masks, parse_polygons


def test_parse_polygons_valid():
    """Test parsing valid mask JSON."""
    mask_json = '[{"points": [{"x": 0.1, "y": 0.1}, {"x": 0.9, "y": 0.1}, {"x": 0.5, "y": 0.9}]}]'
    polygons = parse_polygons(mask_json)
    assert len(polygons) == 1
    assert len(polygons[0]) == 3
    assert polygons[0][0] == [0.1, 0.1]
    assert polygons[0][1] == [0.9, 0.1]
    assert polygons[0][2] == [0.5, 0.9]


def test_parse_polygons_empty():
    """Test parsing empty or invalid mask JSON."""
    assert parse_polygons("[]") == []
    assert parse_polygons("") == []
    assert parse_polygons(None) == []


def test_parse_polygons_exception(caplog):
    """Test that exception is caught and logged during parsing."""
    with caplog.at_level(logging.ERROR):
        polygons = parse_polygons("invalid json")
    assert polygons == []
    assert any(
        "Error parsing masks JSON" in record.message for record in caplog.records
    )


def test_apply_masks_success():
    """Test normal application of masks."""
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    # Valid polygon
    polygons = [[[0.1, 0.1], [0.9, 0.1], [0.5, 0.9]]]

    # Should not raise any exceptions
    apply_masks(frame, polygons, alpha=1.0, color=(255, 255, 255))

    # Simple check to see if pixels were modified
    assert np.any(frame != 0)

    frame_alpha = np.zeros((100, 100, 3), dtype=np.uint8)
    apply_masks(frame_alpha, polygons, alpha=0.5, color=(255, 255, 255))
    assert np.any(frame_alpha != 0)


def test_apply_masks_exception_handling(caplog):
    """Test exception handling in apply_masks for both alpha branches."""
    frame = np.zeros((100, 100, 3), dtype=np.uint8)

    # Empty polygon to trigger OpenCV assertion error in fillPoly
    polygons = [[]]
    camera_name = "TestCamera"

    with caplog.at_level(logging.ERROR):
        # Alpha >= 1.0 branch
        apply_masks(frame, polygons, alpha=1.0, camera_name=camera_name)

    # Assert that an error was logged and contains the expected camera name and message
    assert any("Error applying mask" in record.message for record in caplog.records)
    assert any(camera_name in record.message for record in caplog.records)

    caplog.clear()

    with caplog.at_level(logging.ERROR):
        # Alpha < 1.0 branch
        apply_masks(frame, polygons, alpha=0.5, camera_name=camera_name)

    assert any("Error applying mask" in record.message for record in caplog.records)
    assert any(camera_name in record.message for record in caplog.records)
