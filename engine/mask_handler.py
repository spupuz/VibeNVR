import cv2
import json
import numpy as np
import logging

logger = logging.getLogger(__name__)

def parse_polygons(mask_json, camera_name="Unknown"):
    """Helper to parse JSON polygons into normalized point lists"""
    polygons = []
    if not mask_json or mask_json == '[]':
        return polygons
        
    try:
        polys = json.loads(mask_json)
        if isinstance(polys, list):
            for p in polys:
                if isinstance(p, dict) and 'points' in p:
                    raw_points = p['points']
                    normalized_points = []
                    for pt in raw_points:
                        if isinstance(pt, dict):
                            normalized_points.append([pt.get('x', 0), pt.get('y', 0)])
                        elif isinstance(pt, (list, tuple)) and len(pt) >= 2:
                            normalized_points.append([pt[0], pt[1]])
                    if normalized_points:
                        polygons.append(normalized_points)
                elif isinstance(p, list):
                    snapped_points = []
                    for pt in p:
                        if len(pt) == 2:
                            x, y = pt
                            if x < 0.02: x = 0.0
                            elif x > 0.98: x = 1.0
                            if y < 0.02: y = 0.0
                            elif y > 0.98: y = 1.0
                            snapped_points.append([x, y])
                    polygons.append(snapped_points)
    except Exception as e:
        logger.error(f"Camera {camera_name}: Error parsing masks JSON: {e}")
    return polygons

def apply_masks(frame, polygons, alpha=1.0, color=(0, 0, 0), camera_name="Unknown"):
    """Draw polygons on the frame based on normalized coordinates"""
    if not polygons:
        return
        
    h, w = frame.shape[:2]
    if alpha >= 1.0:
        for poly in polygons:
            try:
                pts = np.array([[int(p[0] * w), int(p[1] * h)] for p in poly], np.int32)
                pts = pts.reshape((-1, 1, 2))
                cv2.fillPoly(frame, [pts], color)
            except Exception as e:
                logger.error(f"Camera {camera_name}: Error applying mask: {e}")
    else:
        overlay = frame.copy()
        for poly in polygons:
            try:
                pts = np.array([[int(p[0] * w), int(p[1] * h)] for p in poly], np.int32)
                pts = pts.reshape((-1, 1, 2))
                cv2.fillPoly(overlay, [pts], color)
            except Exception as e:
                logger.error(f"Camera {camera_name}: Error applying mask: {e}")
        cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)
