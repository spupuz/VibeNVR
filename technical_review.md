# VibeNVR Technical Review & Feature Recommendations

Based on a detailed architectural review of VibeNVR—a privacy-focused, zero-cloud dependency, local-only NVR utilizing a FastAPI backend, a custom PyAV/FFmpeg/OpenCV processing engine (VibeEngine), and a React frontend—I have identified several high-value functional gaps.

The following proposed features strictly adhere to VibeNVR's core philosophy: Privacy-by-Design, Resource Efficiency, and Seamless Integration with its existing docker-native, modular architecture.

---

### 1. Smart Timeline Thumbnails (Scrubbing / Sprite Sheets)
* **Overview & Strategic Value:** A massive quality-of-life feature for any premium NVR is the ability to scrub over an event timeline and immediately see preview thumbnails *without* fetching full high-res streams or downloading massive video files. This perfectly aligns with the local-only resource efficiency ethos by reducing network and I/O load during forensic searches.
* **Architectural Impact:**
  - `engine/recording_manager.py`
  - `backend/models.py` (Event schema)
  - `frontend/src/components` (Timeline UI)
* **Implementation Blueprint:**
  - **Engine:** Modify `recording_manager.py` (or `camera_thread.py`) to periodically save lightweight, low-resolution JPEGs (e.g., every 5 seconds) during an active recording. Stitch these dynamically in memory into a single vertical/horizontal sprite sheet image before saving it alongside the main `.mp4` file.
  - **Backend:** Extend the `Event` model to include a `sprite_sheet_path` string. Update the CRUD APIs to serve this lightweight asset.
  - **Frontend:** Update the React Event Timeline component to fetch the single sprite sheet. Use CSS background positioning (`background-position`) tied to mouse-hover coordinates to create a seamless scrubbing animation.
* **Resource Optimization:** Extracting frames dynamically via PyAV during the active recording phase has negligible overhead, as frames are already being decoded for the AI/Motion checks. Combining them into a single sprite sheet minimizes small-file I/O operations and reduces HTTP request overhead on the backend.

---

### 2. Intelligent Dynamic Retention & Storage Tiering
* **Overview & Strategic Value:** Currently, storage management (`backend/storage_service.py`) relies on basic FIFO size limits or time-based cutoffs. However, a privacy-focused homelab often captures both critical events (people/vehicles) and noise (wind/shadows). Adding "Event Pinning" or "Important-Only Archival" maximizes disk life and storage value without requiring complex databases.
* **Architectural Impact:**
  - `backend/storage_service.py`
  - `backend/models.py`
* **Implementation Blueprint:**
  - **Models:** Add an `is_pinned` (Boolean) and/or `retention_tier` (String) column to the `Event` schema.
  - **Backend Logic:** Update `cleanup_camera()` in `storage_service.py`. When enforcing quota/time deletions, the logic will bypass `is_pinned` items.
  - **Automation:** Introduce logic during event creation: if the `ai_metadata` contains a critical label (e.g., "person" with >80% confidence), automatically flag it as "Important" for extended retention. Non-critical motion events can be aggressively pruned after 24 hours.
* **Resource Optimization:** This is purely a database query modification and logical check overhead. Processing happens via the existing background scheduler thread (`storage_monitor_loop`), adding exactly zero CPU/RAM load to the real-time VibeEngine video pipeline.

---

### 3. Native Integration with Home Assistant (Advanced Binary Sensors via MQTT)
* **Overview & Strategic Value:** VibeNVR already has a built-in MQTT service (`engine/mqtt_service.py`), but true homelab integration requires seamless, rich automation triggers. Creating specialized binary sensors for specific AI objects allows users to trigger local automations (e.g., turn on porch lights *only* if a "person" is detected, not a "vehicle") without external cloud Webhooks.
* **Architectural Impact:**
  - `engine/mqtt_service.py`
  - `engine/camera_thread.py`
* **Implementation Blueprint:**
  - **Engine (MQTT):** Enhance `publish_discovery()` to advertise multiple sub-sensors for each camera (e.g., `binary_sensor.vibe_cam1_person`, `binary_sensor.vibe_cam1_vehicle`) using Home Assistant's MQTT Discovery protocol.
  - **Engine (AI Trigger):** In `camera_thread.py` during `_update_ui_frame` or motion handling, when `ai_results` are parsed, dynamically publish `ON`/`OFF` payloads to the specific MQTT topic corresponding to the detected object class, alongside the generic motion topic.
* **Resource Optimization:** MQTT message publishing is extremely lightweight. Leveraging the existing paho-mqtt client connections and only firing on state changes ensures zero added continuous processing overhead.

---

### 4. Stream Health Diagnostics Dashboard (Internal Probe)
* **Overview & Strategic Value:** Flaky RTSP streams (packet drops, jitter, TCP/UDP mismatches) are the primary headache for self-hosted NVR operators. A dedicated UI dashboard showing dropped packet rates, restart counts, and true FPS would save hours of user debugging and optimize their homelab deployments without needing external monitoring stacks.
* **Architectural Impact:**
  - `engine/stream_reader.py`
  - `engine/main.py` (API Stats)
  - `frontend/src/components` (Camera Config/Settings UI)
* **Implementation Blueprint:**
  - **Engine:** Have `stream_reader.py` maintain an internal ring-buffer or simple counter of decode metrics (e.g., PyAV decode exceptions, `av.error` counts, packet sequence drift, actual frames delivered per second).
  - **API:** Expose these metrics dynamically in the `GET /stats` endpoint or a new `GET /cameras/{id}/diagnostics` endpoint.
  - **Frontend:** Add a "Diagnostics" overlay or tab within the Camera Configuration modal that visualizes these metrics. This empowers users to confidently tweak RTSP Transport protocols (TCP vs UDP) or sub-stream settings.
* **Resource Optimization:** Incrementing counters during the PyAV decode loop inside `stream_reader.py` requires minimal CPU cycles. The frontend will only poll this endpoint (e.g., every 3-5 seconds) while the diagnostic modal is actively open, preventing background REST overhead.
