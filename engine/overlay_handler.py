import cv2
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

def draw_overlay(frame, config):
    try:
        h, w = frame.shape[:2]
        user_preference = config.get('text_scale', 1.0)
        base_font_scale = 1.0
        font_scale = max(0.4, (w / 1200.0) * user_preference * base_font_scale)
        thickness = max(1, int(font_scale * 2.0))
        cam_name = config.get('name', 'Camera')

        def process_text(text):
            if not text: return ""
            text = text.replace('%$', cam_name).replace('%N', cam_name)
            if '%' in text: 
                try: text = datetime.now().strftime(text)
                except: pass
            return text

        # Text Right (Bottom Right)
        text_right = process_text(config.get('text_right', ''))
        if text_right:
            (ts_w, ts_h), _ = cv2.getTextSize(text_right, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
            cv2.rectangle(frame, (w - ts_w - 20, h - ts_h - 20), (w, h), (0, 0, 0), -1)
            cv2.putText(frame, text_right, (w - ts_w - 10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness)

        # Text Left (Top Left)
        text_left = process_text(config.get('text_left', ''))
        if text_left:
            (nm_w, nm_h), _ = cv2.getTextSize(text_left, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
            cv2.rectangle(frame, (0, 0), (nm_w + 20, nm_h + 20), (0, 0, 0), -1)
            cv2.putText(frame, text_left, (10, nm_h + 10), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness)
    except Exception as e:
        logger.error(f"Overlay error for camera {config.get('name')}: {e}")
