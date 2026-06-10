import contextlib
import os
import sys
import time
import logging
import threading
import contextlib
import numpy as np
import cv2
from typing import List, Dict, Any

# Suppress TFLite / TensorFlow C++ internal logging BEFORE importing tflite_runtime.
# These control the underlying C++ logging framework (ABSL / glog) used by TFLite.
# Level 3 = FATAL only (0=INFO, 1=WARNING, 2=ERROR, 3=FATAL).
# This prevents model metadata, COCO labels, and delegate info from being
# dumped to stdout/stderr on every model load, which pollutes docker compose logs.
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("TF_CPP_MIN_VLOG_LEVEL", "0")
os.environ.setdefault("GLOG_minloglevel", "3")
os.environ.setdefault("TFLITE_EXTERNAL_DELEGATE_VERBOSE", "0")

try:
    import tflite_runtime.interpreter as tflite
    HAS_TFLITE = True
except ImportError:
    HAS_TFLITE = False

logger = logging.getLogger(__name__)

@contextlib.contextmanager
def _suppress_native_output():
    """
    Suppress C-level stdout and stderr during TFLite/EdgeTPU model loading.
    TFLite native libraries print binary data directly to file descriptors 1 & 2,
    bypassing Python's logging system. This redirects those FDs to /dev/null
    for the duration of the block, keeping docker compose logs clean.
    Python logger calls within this block are unaffected because the logging
    handlers write to the restored FDs after the block exits.
    """
    # Flush Python-level buffers BEFORE redirecting FDs so buffered Python
    # output is not accidentally swallowed.
    sys.stdout.flush()
    sys.stderr.flush()
    devnull_fd = os.open(os.devnull, os.O_WRONLY)
    saved_stdout = os.dup(1)
    saved_stderr = os.dup(2)
    try:
        os.dup2(devnull_fd, 1)
        os.dup2(devnull_fd, 2)
        yield
    finally:
        # Restore FDs and close temporaries
        os.dup2(saved_stdout, 1)
        os.dup2(saved_stderr, 2)
        os.close(devnull_fd)
        os.close(saved_stdout)
        os.close(saved_stderr)

import contextlib

@contextlib.contextmanager
def non_blocking_lock(lock):
    acquired = lock.acquire(blocking=False)
    try:
        yield acquired
    finally:
        if acquired:
            lock.release()

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
            return
            
        self.config = config or {}
        self.interpreter = None
        self.labels = {}
        self.hardware = "unknown"
        self.inference_lock = threading.Lock()
        
        if not HAS_TFLITE:
            logger.error("AI: tflite-runtime not installed. AI disabled.")
            return
            
        # Initial model type from config (camera or global)
        self.model_type = self.config.get('ai_model', 'mobilenet_ssd_v2')
        self._enabled = self.config.get('ai_enabled', False)
        
        if self._enabled:
            self._load_model()
            logger.info("AI: Engine initialized in DISABLED state (Global Switch is OFF)")
            
        self._initialized = True
        self._tpu_fail_count = 0
        self._last_tpu_fail = 0

    @property
    def enabled(self):
        return self._enabled

    def set_enabled(self, enabled: bool):
        """Enable or disable the AI detector dynamically"""
        with self.inference_lock:
            if enabled == self._enabled:
                return
            
            self._enabled = enabled
            if enabled:
                logger.info("AI: GLOBAL ACTIVATION - Loading models...")
                self._load_model()
            else:
                logger.info("AI: GLOBAL DEACTIVATION - Releasing resources...")
                self.interpreter = None
                self.labels = {}
                self.hardware = "disabled"

    def update_model(self, model_type: str):
        """Reload model if type has changed"""
        with self.inference_lock:
            if model_type == self.model_type and self.interpreter is not None:
                return
            
            logger.info(f"AI: Switching global model from {self.model_type} to {model_type}...")
            self.model_type = model_type
            # Update config so next reload uses this type
            self.config['ai_model'] = model_type
            self._load_model()

    def update_hardware(self, hardware: str):
        """Reload model if hardware preference has changed"""
        with self.inference_lock:
            current_pref = self.config.get('ai_hardware', 'auto')
            if hardware == current_pref and self.interpreter is not None:
                return
            
            logger.info(f"AI: Switching global hardware from {current_pref} to {hardware}...")
            # Update config
            self.config['ai_hardware'] = hardware
            self._load_model()

    def _load_model(self, force_cpu=False):
        """
        Load TFLite model with iterative fallback strategy:
        1. Requested Model (YOLO/SSD) + Requested Hardware (TPU/CPU)
        2. If YOLO failed, try YOLO + CPU
        3. If still failed, try SSD + TPU
        4. If still failed, try SSD + CPU
        """
        model_dir = "models"
        self.interpreter = None
        
        # Initial target from config
        target_model = self.config.get('ai_model', 'mobilenet_ssd_v2')
        pref_hw = self.config.get('ai_hardware', 'auto').lower()
        if force_cpu: pref_hw = "cpu"

        # Define fallback chain: (model_type, hardware)
        fallback_chain = []
        if target_model == 'yolo_v8':
            if pref_hw != 'cpu':
                fallback_chain.append(('yolo_v8', 'tpu'))
            fallback_chain.append(('yolo_v8', 'cpu'))
            if pref_hw != 'cpu':
                fallback_chain.append(('mobilenet_ssd_v2', 'tpu'))
            fallback_chain.append(('mobilenet_ssd_v2', 'cpu'))
        else:
            if pref_hw != 'cpu':
                fallback_chain.append(('mobilenet_ssd_v2', 'tpu'))
            fallback_chain.append(('mobilenet_ssd_v2', 'cpu'))

        # TPU Cooldown check: if TPU failed recently, skip TPU in chain
        tpu_cooldown = time.time() - self._last_tpu_fail < 300 # 5 minute cooldown
        
        for model_type, hardware in fallback_chain:
            if hardware == 'tpu' and (tpu_cooldown or self._tpu_fail_count > 3):
                logger.debug(f"AI: Skipping EdgeTPU for {model_type} due to recent failures/cooldown.")
                continue

            if model_type == 'yolo_v8':
                tpu_path = os.path.join(model_dir, "yolov8n_quant_edgetpu.tflite")
                cpu_path = os.path.join(model_dir, "yolov8n_quant.tflite")
                labels_path = os.path.join(model_dir, "yolo_labels.txt")
            else:
                tpu_path = os.path.join(model_dir, "mobilenet_ssd_v2_coco_quant_postprocess_edgetpu.tflite")
                cpu_path = os.path.join(model_dir, "mobilenet_ssd_v2_coco_quant_postprocess.tflite")
                labels_path = os.path.join(model_dir, "coco_labels.txt")

            model_path = tpu_path if hardware == 'tpu' else cpu_path
            
            if not os.path.exists(model_path):
                logger.debug(f"AI: Model file {model_path} not found. Trying next fallback.")
                continue

            try:
                if hardware == 'tpu':
                    logger.info(f"AI: Attempting to load EdgeTPU delegate for {model_type}...")
                    _lib_path = '/usr/lib/x86_64-linux-gnu/libedgetpu.so.1'
                    if not os.path.exists(_lib_path):
                        raise FileNotFoundError(f"libedgetpu.so.1 not found at {_lib_path}")
                    
                    with _suppress_native_output():
                        self.interpreter = tflite.Interpreter(
                            model_path=model_path,
                            experimental_delegates=[tflite.load_delegate(_lib_path)]
                        )
                else:
                    logger.info(f"AI: Loading CPU interpreter for {model_type} from {model_path}...")
                    with _suppress_native_output():
                        self.interpreter = tflite.Interpreter(model_path=model_path)
                
                # Success!
                self.hardware = hardware
                self.model_type = model_type
                logger.info(f"AI: SUCCESS - Loaded {hardware.upper()} model {model_type} from {model_path}")
                
                # Load labels
                self._load_labels(labels_path)
                
                # Initialize tensors
                with _suppress_native_output():
                    self.interpreter.allocate_tensors()
                    self.input_details = self.interpreter.get_input_details()
                    self.output_details = self.interpreter.get_output_details()
                
                # Warmup inference
                if hardware == 'tpu':
                    logger.info("AI: Running warmup inference for TPU...")
                    logger.info("AI: Delaying TPU warmup to allow host CPU to stabilize...")
                    time.sleep(3.0)
                    try:
                        input_shape = self.input_details[0]['shape']
                        import numpy as np
                        dummy_data = np.zeros(input_shape, dtype=self.input_details[0]['dtype'])
                        self.interpreter.set_tensor(self.input_details[0]['index'], dummy_data)
                        self.interpreter.invoke()
                        logger.info("AI: Warmup complete.")
                    except Exception as w_e:
                        logger.warning(f"AI: Warmup failed: {w_e}")

                # Reset failure tracking on success
                if hardware == 'tpu':
                    self._tpu_fail_count = 0
                return
                
            except Exception as e:
                logger.warning(f"AI: Failed to load {hardware} model {model_type}: {e}")
                if hardware == 'tpu':
                    self._tpu_fail_count += 1
                    self._last_tpu_fail = time.time()
                continue

        logger.error("AI: All models in fallback chain failed to load. AI disabled.")
        self.interpreter = None
        self.hardware = "failed"

    def _load_labels(self, labels_path):
        self.labels = {}
        if os.path.exists(labels_path):
            try:
                with open(labels_path, 'r') as f:
                    for i, line in enumerate(f):
                        line = line.strip()
                        if not line: continue
                        pair = line.split(maxsplit=1)
                        if len(pair) == 2 and pair[0].isdigit():
                            self.labels[int(pair[0])] = pair[1]
                        else:
                            self.labels[i] = line
            except Exception as e:
                logger.warning(f"AI: Error reading labels {labels_path}: {e}")
        
        if not self.labels:
            # Hardcoded fallbacks if file missing or empty
            if self.model_type == 'yolo_v8':
                self.labels = {0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck', 16: 'dog', 15: 'cat'}
            else:
                self.labels = {0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck', 16: 'cat', 17: 'dog'}

    def _start_inference_thread(self):
        """Start a dedicated background thread that owns all interpreter.invoke() calls.
        
        The Coral EdgeTPU USB driver can hang indefinitely when the host CPU is under
        heavy load (e.g. libx264 startup). By isolating invoke() in its own daemon thread,
        the camera thread can time out on the result queue and continue without blocking.
        If invoke() hangs, the thread is abandoned (daemon=True) and a fresh CPU model
        is loaded in a new thread.
        """
        import queue as _queue
        self._infer_queue = _queue.Queue(maxsize=1)   # Single frame slot (always latest)
        self._infer_thread_alive = threading.Event()
        self._infer_thread_alive.set()

        def _inference_loop():
            logger.info(f"AI: Inference thread started (hardware={self.hardware})")
            while self._infer_thread_alive.is_set():
                try:
                    task = self._infer_queue.get(timeout=0.5)
                except Exception:
                    continue  # Timeout, loop again

                if task is None:
                    break  # Shutdown signal

                input_data, camera_id, request_q = task
                try:
                    if not self.interpreter:
                        request_q.put([], block=False)
                        continue
                    self.interpreter.set_tensor(self.input_details[0]['index'], input_data)
                    self.interpreter.invoke()
                    # Collect raw outputs
                    raw = {
                        'boxes': None, 'classes': None, 'scores': None, 'count': None,
                        'raw_outputs': [self.interpreter.get_tensor(d['index']) for d in self.output_details],
                        'model_type': self.model_type,
                        'hardware': self.hardware,
                    }
                    request_q.put(raw, block=False)
                except Exception as e:
                    logger.error(f"AI: Inference thread error: {e}")
                    try:
                        request_q.put([], block=False)
                    except Exception:
                        pass
            logger.info("AI: Inference thread exiting")

        self._infer_thread = threading.Thread(target=_inference_loop, daemon=True)
        self._infer_thread.start()

    def detect(self, frame, camera_id: int = 0, config: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        if not self._enabled or not self.interpreter:
            return []

        # Ensure inference thread is running
        if not hasattr(self, '_infer_queue') or not getattr(self, '_infer_thread', None) or not self._infer_thread.is_alive():
            logger.info("AI: (Re)starting inference thread...")
            self._start_inference_thread()

        current_config = config or self.config

        # Pre-process frame
        try:
            input_shape = self.input_details[0]['shape']
            h, w = input_shape[1], input_shape[2]
            input_frame = cv2.resize(frame, (w, h))
            if input_frame is None or input_frame.size == 0:
                return []
            input_data = np.expand_dims(input_frame, axis=0)

            expected_dtype = self.input_details[0]['dtype']
            if expected_dtype == np.int8 or expected_dtype == np.uint8:
                if expected_dtype == np.int8 and input_data.dtype == np.uint8:
                    input_data = (input_data.astype(np.int16) - 128).astype(np.int8)
                elif expected_dtype == np.uint8 and input_data.dtype == np.int8:
                    input_data = (input_data.astype(np.int16) + 128).astype(np.uint8)
        except Exception as e:
            logger.error(f"Camera {camera_id}: AI pre-process error: {e}")
            return []

        # Use a submit lock to ensure only one camera is waiting on the inference thread at a time.
        # This prevents the 6s watchdog from firing due to queue wait time, measuring only actual invoke() time.
        if not getattr(self, '_submit_lock', None):
            self._submit_lock = threading.Lock()
            
        # Wait up to 200ms for the AI to become free. This drastically improves the detection 
        # hit rate for multi-camera setups without blocking the video stream for too long.
        if not self._submit_lock.acquire(timeout=0.2):
            return []  # AI is heavily loaded, drop frame

        try:
            # Submit to inference thread
            import queue as _queue
            request_q = _queue.Queue(maxsize=1)
            try:
                self._infer_queue.put_nowait((input_data, camera_id, request_q))
            except Exception:
                return []

            # Block on result (timeout prevents hanging the camera thread if TPU crashes)
            try:
                raw = request_q.get(timeout=6.0)
            except _queue.Empty:
                logger.warning(f"AI: invoke() timed out (6s) on {self.hardware} — reloading model.")
                self._tpu_fail_count += 1
                self._last_tpu_fail = time.time()
                self.interpreter = None
                self.hardware = "resetting"
                if hasattr(self, '_infer_thread_alive'):
                    self._infer_thread_alive.clear()
                if getattr(self, '_infer_queue', None):
                    try: self._infer_queue.get_nowait()
                    except Exception: pass
                
                # Allow TPU to retry up to 3 times before forcing CPU fallback.
                # The EdgeTPU USB driver can crash during libx264 high-CPU bursts.
                # Re-loading the model after the burst settles usually recovers it.
                force_cpu = self._tpu_fail_count > 3
                threading.Thread(target=self._load_model, kwargs={'force_cpu': force_cpu}, daemon=True).start()
                return []
        finally:
            self._submit_lock.release()

        if not isinstance(raw, dict):
            return []  # Error sentinel from inference thread

        # Post-process results using raw_outputs collected by the inference thread
        raw_outputs = raw.get('raw_outputs', [])
        model_type = raw.get('model_type', self.model_type)
        results = []
        threshold = current_config.get('ai_threshold', 0.5)
        allowed_objects = current_config.get('ai_object_types', ["person", "vehicle"])
        vehicle_classes = ["car", "truck", "bus", "motorcycle"]
        input_h, input_w = input_frame.shape[0], input_frame.shape[1]

        try:
            if model_type == 'yolo_v8':
                output = raw_outputs[0][0]

                if len(raw_outputs) >= 3 and output.shape[-1] == 4:
                    # SSD-style fallback for 'YOLO'-labeled models
                    boxes = raw_outputs[0][0]
                    classes = raw_outputs[1][0]
                    scores = raw_outputs[2][0]
                    count = len(scores) if len(raw_outputs) < 4 else int(raw_outputs[3][0])
                    for i in range(min(count, len(boxes))):
                        score = float(scores[i])
                        if score >= threshold:
                            class_id = int(classes[i])
                            label = self.labels.get(class_id, "unknown")
                            if label in allowed_objects or ("vehicle" in allowed_objects and label in vehicle_classes):
                                results.append({"label": label, "score": score, "confidence": score,
                                                "box": [float(boxes[i][0]), float(boxes[i][1]), float(boxes[i][2]), float(boxes[i][3])]})
                else:
                    # Standard YOLOv8 format
                    if output.ndim == 2 and output.shape[0] < output.shape[1]:
                        output = output.T
                    o_detail = self.output_details[0]
                    o_scale, o_zero = 1.0, 0
                    if 'quantization' in o_detail:
                        o_scale, o_zero = o_detail['quantization']
                    if output.shape[-1] <= 4:
                        logger.error(f"Camera {camera_id}: YOLOv8 unexpected output shape {output.shape}")
                        return []
                    candidate_boxes, candidate_scores, candidate_labels = [], [], []
                    for row in output:
                        f_row = (row.astype(np.float32) - o_zero) * o_scale if (o_scale != 1.0 or o_zero != 0) else row.astype(np.float32)
                        scores_row = f_row[4:]
                        if len(scores_row) == 0: continue
                        class_id = np.argmax(scores_row)
                        score = float(scores_row[class_id])
                        if score >= threshold:
                            label = self.labels.get(class_id, "unknown")
                            if label in allowed_objects or ("vehicle" in allowed_objects and label in vehicle_classes):
                                xc, yc, bw, bh = f_row[0], f_row[1], f_row[2], f_row[3]
                                candidate_boxes.append([float(xc - bw/2), float(yc - bh/2), float(bw), float(bh)])
                                candidate_scores.append(score)
                                candidate_labels.append(label)
                    if candidate_boxes:
                        nms_indices = cv2.dnn.NMSBoxes(candidate_boxes, candidate_scores, threshold, 0.45)
                        if len(nms_indices) > 0:
                            if isinstance(nms_indices, np.ndarray):
                                nms_indices = nms_indices.flatten()
                            for i in nms_indices:
                                label = candidate_labels[i]
                                score = candidate_scores[i]
                                x, y, bw, bh = candidate_boxes[i]
                                if x + bw/2 <= 1.1 and y + bh/2 <= 1.1:
                                    ymin, xmin, ymax, xmax = y, x, y + bh, x + bw
                                else:
                                    ymin, xmin, ymax, xmax = y/input_h, x/input_w, (y+bh)/input_h, (x+bw)/input_w
                                results.append({"label": label, "score": score, "confidence": score,
                                                "box": [float(ymin), float(xmin), float(ymax), float(xmax)]})
                            results = sorted(results, key=lambda x: x['score'], reverse=True)[:10]
            else:
                # SSD Post-processing
                boxes   = raw_outputs[0][0]
                classes = raw_outputs[1][0]
                scores  = raw_outputs[2][0]
                count   = int(raw_outputs[3][0])
                for i in range(count):
                    score = float(scores[i])
                    if score >= threshold:
                        class_id = int(classes[i])
                        label = self.labels.get(class_id, "unknown")
                        if label in allowed_objects or ("vehicle" in allowed_objects and label in vehicle_classes):
                            results.append({"label": label, "score": score, "confidence": score,
                                            "box": [float(boxes[i][0]), float(boxes[i][1]), float(boxes[i][2]), float(boxes[i][3])]})
        except Exception as e:
            logger.error(f"Camera {camera_id}: AI post-process error: {e}")
            return []

        if results:
            logger.debug(f"Camera {camera_id}: AI detected {len(results)} objects ({self.hardware} - {model_type})")
        return results

