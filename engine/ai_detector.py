import os
import time
import logging
import threading
import numpy as np
import cv2
from typing import List, Dict, Any

try:
    import tflite_runtime.interpreter as tflite
    HAS_TFLITE = True
except ImportError:
    HAS_TFLITE = False

logger = logging.getLogger(__name__)

class AIDetector:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(AIDetector, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self, camera_id: int = 0, config: Dict[str, Any] = None):
        if self._initialized:
            # Update config if provided, but don't reload model
            if config: self.config = config
            return
            
        self.config = config or {}
        self.interpreter = None
        self.labels = {}
        self.hardware = "unknown"
        self.inference_lock = threading.Lock()
        
        if not HAS_TFLITE:
            logger.error("AI: tflite-runtime not installed. AI disabled.")
            self._initialized = True
            return

        self._load_model()
        self._initialized = True

    def _load_model(self, force_cpu=False):
        model_dir = "models"
        labels_path = os.path.join(model_dir, "coco_labels.txt")
        tpu_model = os.path.join(model_dir, "mobilenet_ssd_v2_coco_quant_postprocess_edgetpu.tflite")
        cpu_model = os.path.join(model_dir, "mobilenet_ssd_v2_coco_quant_postprocess.tflite")

        # Load labels
        if os.path.exists(labels_path):
            with open(labels_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if not line: continue
                    # Handle "0 person" or just "person"
                    pair = line.split(maxsplit=1)
                    try:
                        if len(pair) == 2 and pair[0].isdigit():
                            self.labels[int(pair[0])] = pair[1]
                        else:
                            # If no ID, use the line index as ID
                            self.labels[len(self.labels)] = line
                    except Exception as e:
                        logger.warning(f"AI: Skipping malformed label line '{line}': {e}")

        pref_hw = self.config.get('ai_hardware', 'auto').lower()
        if force_cpu: pref_hw = "cpu"
        
        # Try TPU first
        if pref_hw in ['auto', 'tpu']:
            try:
                logger.info("AI: Attempting to load EdgeTPU delegate...")
                # NOTE: ARM is not currently supported. x86_64 only.
                _lib_path = '/usr/lib/x86_64-linux-gnu/libedgetpu.so.1'
                if not os.path.exists(_lib_path):
                    raise FileNotFoundError(
                        f"libedgetpu.so.1 not found at {_lib_path} — "
                        "Coral TPU not available on this host. Falling back to CPU."
                    )
                self.interpreter = tflite.Interpreter(
                    model_path=tpu_model,
                    experimental_delegates=[tflite.load_delegate(_lib_path)]
                )
                self.hardware = "tpu"
                logger.info("AI: EdgeTPU delegate loaded successfully.")
            except Exception as e:
                if pref_hw == 'tpu':
                    logger.error(f"AI: Failed to load EdgeTPU: {e}")
                else:
                    logger.info(f"AI: EdgeTPU not found or failed ({e}). Falling back to CPU.")


        # Fallback to CPU
        if self.interpreter is None:
            try:
                self.interpreter = tflite.Interpreter(model_path=cpu_model)
                self.hardware = "cpu"
                logger.info("AI: CPU interpreter loaded.")
            except Exception as e:
                logger.error(f"AI: Failed to load CPU model: {e}")

        if self.interpreter:
            self.interpreter.allocate_tensors()
            self.input_details = self.interpreter.get_input_details()
            self.output_details = self.interpreter.get_output_details()

    def detect(self, frame, camera_id: int = 0, config: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        if not self.interpreter:
            return []

        # Use provided config or fallback to instance config
        current_config = config or self.config
        
        with self.inference_lock:
            try:
                # 1. Pre-process
                input_shape = self.input_details[0]['shape']
                h, w = input_shape[1], input_shape[2]
                
                input_frame = cv2.resize(frame, (w, h))
                input_data = np.expand_dims(input_frame, axis=0)

                # 2. Inference
                if input_frame is None or input_frame.size == 0:
                    logger.error(f"Camera {camera_id}: AI received empty frame!")
                    return []

                self.interpreter.set_tensor(self.input_details[0]['index'], input_data)
                t0 = time.time()
                try:
                    self.interpreter.invoke()
                except Exception as e:
                    logger.error(f"AI: Inference failed on {self.hardware}. Falling back to CPU permanently. Error: {e}")
                    self.hardware = "cpu"
                    self.interpreter = None
                    self._load_model(force_cpu=True)
                    return []
                    
                inference_time = time.time() - t0

                # 3. Post-process
                boxes = self.interpreter.get_tensor(self.output_details[0]['index'])[0]
                classes = self.interpreter.get_tensor(self.output_details[1]['index'])[0]
                scores = self.interpreter.get_tensor(self.output_details[2]['index'])[0]
                count = int(self.interpreter.get_tensor(self.output_details[3]['index'])[0])

                results = []
                # FORCE LOWER THRESHOLD FOR DEBUG
                # Default to 0.5 (50%) instead of 0.1 to avoid PTZ motion blur hallucinations
                threshold = current_config.get('ai_threshold', 0.5) 
                
                allowed_objects = current_config.get('ai_object_types', ["person", "vehicle"])
                if isinstance(allowed_objects, str):
                    try:
                        import json
                        # Try parsing as JSON list
                        parsed = json.loads(allowed_objects.replace("'", '"'))
                        if isinstance(parsed, list):
                            allowed_objects = parsed
                        else:
                            logger.warning(f"Camera {camera_id}: ai_object_types is a string but not a list: {allowed_objects}")
                    except Exception as e:
                        logger.error(f"Camera {camera_id}: Failed to parse ai_object_types string '{allowed_objects}': {e}")
                        allowed_objects = ["person", "vehicle"]
                
                vehicle_classes = ["car", "truck", "bus", "motorcycle"]
                
                # Debug log for top scores
                if count > 0:
                    top_score = float(scores[0])
                    top_label = self.labels.get(int(classes[0]), "unknown")
                    # logger.debug(f"Camera {camera_id}: Top AI result: {top_label} ({top_score:.2f})")

                for i in range(count):
                    score = float(scores[i])
                    if score >= threshold:
                        class_id = int(classes[i])
                        label = self.labels.get(class_id, "unknown")
                        
                        is_allowed = False
                        if label in allowed_objects:
                            is_allowed = True
                        elif "vehicle" in allowed_objects and label in vehicle_classes:
                            is_allowed = True
                        
                        if is_allowed:
                            results.append({
                                "label": label,
                                "score": score,
                                "confidence": score, # Compatibility for camera_thread renderer
                                "box": [float(boxes[i][0]), float(boxes[i][1]), float(boxes[i][2]), float(boxes[i][3])]
                            })
                
                if results:
                    logger.debug(f"Camera {camera_id}: AI Detected {len(results)} objects in {inference_time:.3f}s ({self.hardware})")
                
                return results
            except Exception as e:
                logger.error(f"Camera {camera_id}: AI Detection error: {e}")
                return []
