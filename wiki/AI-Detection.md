# AI Object Detection

VibeNVR supports hardware-accelerated AI object detection via **Google Coral Edge TPU** or standard **CPU inference**. When enabled, the AI engine replaces or augments classical OpenCV motion detection with a real TensorFlow Lite object recognition pipeline that can identify people, vehicles, animals, and more.

---

## 🧠 How It Works

When a camera's detection engine is set to **AI**, each video frame is:
1. Resized and fed to a TFLite object detection model (e.g., **YOLOv8** or **MobileNet SSD v2**).
2. Filtered by **confidence threshold** and **allowed object types**.
3. **Non-Maximum Suppression (NMS)** is applied to eliminate overlapping detections (especially relevant for YOLOv8).
4. **Motion zones** (exclusion polygons) are applied to the bounding boxes.
5. If any objects pass all filters → motion is triggered, a recording starts, and detected labels are stored in the event database.

All detected labels are saved per-event as `ai_metadata` (e.g., `person,car`) and are used by the **Timeline** object filter.

---

## 🏗️ Global AI Configuration

Starting from v1.30.0, core AI parameters like **Model Selection** and **Hardware Acceleration** are managed **globally** in **System Settings → AI Detection Engine**. This ensures that the AI engine runs as a shared singleton, optimizing memory usage and ensuring consistency across all cameras.

| Setting | Description | Recommended |
|---------|-------------|-------------|
| **AI Model** | Choose between `YOLOv8` (Superior accuracy) or `MobileNet SSD v2` (Faster/Legacy) | `YOLOv8` |
| **AI Hardware** | `auto` (TPU preferred, CPU fallback), `cpu`, `tpu` | `auto` |

---

## 🎯 Detection Engines

| Engine | Description | Indicator |
|--------|-------------|-----------|
| **OpenCV** | Classic background subtraction (MOG2). Fast, no ML. | `MOTION` |
| **ONVIF Edge** | Motion events delegated to camera hardware. | `EDGE MOTION` |
| **AI** | TFLite inference on CPU or Coral TPU. | `AI MOTION` |

> [!TIP]
> The `AI MOTION` label in Live View will show `AI Engine [TPU]` or `AI Engine [CPU]` in the system logs, indicating which hardware performed the inference.

---

## ⚙️ Camera Configuration

Navigate to **Cameras → Edit → AI & Tracking Tab** to configure per-camera detection behavior:

| Setting | Description | Default |
|---------|-------------|---------|
| **AI Detection** | Toggle to enable ML-based detection for this camera | `Disabled` |
| **Confidence Threshold** | Minimum score (0–100%) for a detection to count | `50%` |
| **Allowed Objects** | Comma-separated list: `person`, `vehicle`, `dog`, etc. | `person, vehicle` |
| **Tracking Enabled** | Enable persistent object tracking across frames | `Disabled` |

> [!TIP]
> **Robust Configuration**: VibeNVR implements a high-resilience parser for `Allowed Objects`. It supports both JSON (e.g. `["person", "vehicle"]`) and simple comma-separated lists (e.g. `person, vehicle`). This prevents configuration loss if the database is manually edited or during complex system migrations.

> [!NOTE]
> Setting confidence too low (e.g., 33%) can cause false positives from spinning objects, reflections, or camera noise. **70%+ is recommended** for stable production use.

> [!IMPORTANT]
> When the AI engine is active, `Passthrough Recording` is automatically incompatible and must be disabled, as the engine needs to process frames to apply detection and motion triggers.

---

## 🤖 Coral Edge TPU Setup

The Coral USB Accelerator dramatically speeds up inference (~10–15ms vs ~300ms CPU). It appears as a USB device and must be passed through to the Docker engine container.

### Prerequisites

1. The Coral USB Accelerator must be **plugged into a USB 3.0 port** on the host.
2. Verify it is detected: `lsusb | grep Google` should show `18d1:9302` or similar.
3. The engine Docker image already installs `libedgetpu1-std` and downloads the `_edgetpu.tflite` model at build time.

---

## 🐳 Docker Compose Configuration

The `docker-compose.yml` already includes the necessary `privileged: true` flag and `/dev/bus/usb` volume mount for Coral support. Verify the `engine` service contains:

```yaml
services:
  engine:
    # ...
    volumes:
      - /dev/bus/usb:/dev/bus/usb       # Required for Coral USB access
    privileged: true                      # Grants access to USB devices
```

> [!WARNING]
> `privileged: true` is required because the EdgeTPU runtime communicates with the device via low-level USB calls that need host-level access. This is the approach used in the official Google Coral Docker examples.

If you prefer not to use `privileged`, you can alternatively pass the device explicitly using `devices:` — but you must know the exact device node:

```yaml
services:
  engine:
    # ...
    devices:
      - /dev/bus/usb/001/002:/dev/bus/usb/001/002  # Replace with your actual Coral device path
      - /dev/dri:/dev/dri                            # Keep for GPU/VAAPI
```

> [!NOTE]
> The device path (`/dev/bus/usb/001/002`) can change after each reboot. Using `privileged: true` is more robust for Coral USB on consumer hardware.

---

## 🐧 Proxmox LXC Container Configuration

If VibeNVR is running inside a **Proxmox LXC container**, the Coral USB device must be explicitly passed through at the **LXC level** before Docker can access it. This requires editing the container's configuration file on the Proxmox host.

### Step 1: Identify the Coral Device

On the **Proxmox host** (not inside the LXC), run:

```bash
lsusb | grep -i google
# Expected output: Bus 001 Device 002: ID 18d1:9302 Google Inc. Coral USB Accelerator
```

Note the **bus number** (e.g., `001`) and **device number** (e.g., `002`). The device numbers change at each reboot — so we pass the entire USB bus instead.

Also find the USB device major:minor numbers for cgroup rules:
```bash
ls -la /dev/bus/usb/001/
# You will see entries like: crw-rw-rw- 1 root root 189, 1 ...
# The major number is 189 for USB devices
```

### Step 2: Edit the LXC Config File on the Proxmox Host

The LXC config file is located at `/etc/pve/lxc/<VMID>.conf`. Edit it as root on the Proxmox host:

```bash
nano /etc/pve/lxc/103.conf    # Replace 103 with your LXC container ID
```

Add the following lines to the config file:

```ini
# Allow all cgroup2 device access (required for dynamic USB device numbers)
lxc.cgroup2.devices.allow: a

# Drop no capabilities (the container needs USB access)
lxc.cap.drop:

# Allow USB character devices (major 189 = USB)
lxc.cgroup2.devices.allow: c 189:* rwm

# Mount the entire USB bus into the LXC container
lxc.mount.entry: /dev/bus/usb/001 dev/bus/usb/001 none bind,create=dir 0,0

# Disable AppArmor restrictions so Docker inside LXC can use privileged containers
lxc.apparmor.profile: unconfined

# Enable nesting (required for Docker inside LXC)
features: nesting=1
```

> [!IMPORTANT]
> Replace `/dev/bus/usb/001` with the actual USB bus where your Coral is connected. If you have multiple USB buses, mount all of them (e.g., `/dev/bus/usb/001` through `/dev/bus/usb/004`).

> [!WARNING]
> `lxc.apparmor.profile: unconfined` disables AppArmor restrictions for this container. This is necessary for `docker run --privileged` to work correctly inside an LXC, which in turn is required for Coral USB access. Ensure the container is otherwise hardened at the network level.

### Step 3: Restart the LXC Container

```bash
pct stop 103 && pct start 103
# Or via the Proxmox web UI: Container → Stop → Start
```

### Step 4: Verify Inside the LXC

Inside the LXC container, confirm the USB device is visible:

```bash
lsusb | grep -i google
# Should show the Coral USB Accelerator

ls -la /dev/bus/usb/001/
# Should list the device files
```

### Complete Working LXC Config Example

This is a real-world config for a Proxmox LXC running VibeNVR with Coral TPU and Docker:

```ini
# Basic LXC settings
arch: amd64
cores: 4
memory: 8192
hostname: vibenvr-host
ostype: debian

# Docker requires nesting
features: nesting=1

# Disable AppArmor so privileged Docker containers work
lxc.apparmor.profile: unconfined

# Device access: allow all (simplest for USB hot-plug)
lxc.cgroup2.devices.allow: a
lxc.cap.drop:

# Allow USB character devices (Coral uses major 189)
lxc.cgroup2.devices.allow: c 189:* rwm

# Mount the GPU device for VAAPI hardware transcoding (optional)
dev0: /dev/dri/renderD128,gid=992
dev1: /dev/dri/card0,gid=44

# Mount the USB bus containing the Coral TPU
lxc.mount.entry: /dev/bus/usb/001 dev/bus/usb/001 none bind,create=dir 0,0

# Network
net0: name=eth0,bridge=vmbr0,ip=dhcp,type=veth
```

---

## 🔍 Verifying TPU Usage

After starting VibeNVR with AI detection enabled, check the engine logs:

```bash
docker compose logs engine | grep -i "AI:"
```

Expected output on successful TPU load:
```
AI: Attempting to load EdgeTPU delegate...
AI: EdgeTPU delegate loaded successfully.
```

Expected output when falling back to CPU:
```
AI: EdgeTPU not found or failed (...). Falling back to CPU.
AI: CPU interpreter loaded.
```

When a detection fires:
```
[AI DETECT] Camera MyCamera (ID: 1): Motion START. Found: person (82%), car (74%)
```

---

## 📊 Dashboard Observability

VibeNVR introduces real-time visibility for the AI engine status:

- **AI Processor Widget**: Located on the Dashboard, this widget indicates if the AI engine is initialized and which hardware (TPU or CPU) is currently being used for inference.
- **Service Status**: Instant feedback on the health of the AI inference pipeline.

---

## 📅 AI Metadata & Timeline Filtering

Every event created by the AI engine has its detected objects stored in the database as `ai_metadata`.

- **AI Labels (Badges)**: Surfaced directly on event cards in the **Recent Events** list and the **Timeline**. Detected objects are displayed as stylized "pill" badges with a `Brain` icon.
- **Unified Filtering**: In the **Timeline** view, you can use the **"Objects" filter** dropdown to show only events where a specific object was detected:
    - **All Objects** — show everything.
    - **Person** — only events with `person` in the AI metadata.
    - **Vehicle** — events with `car`, `truck`, `bus`, or `motorcycle`.

> [!NOTE]
> Events recorded before the AI engine was enabled will not have object metadata and will not appear under object-specific filters.

---

## 🔄 Model Files

The detection models are downloaded automatically during the Docker image build from official Google Coral repositories. They are stored in `engine/models/` inside the container and are excluded from Git:

| File | Use |
|------|-----|
| `mobilenet_ssd_v2_coco_quant_postprocess_edgetpu.tflite` | Primary model — Coral TPU |
| `mobilenet_ssd_v2_coco_quant_postprocess.tflite` | Fallback model — CPU |
| `coco_labels.txt` | 90 COCO object class labels |

To manually download them (e.g., for offline builds), run:

```bash
python3 engine/scripts/download_models.py
```

### Supported Models (Quantized TFLite)

| Model | Hardware | File |
|-------|----------|------|
| **YOLOv8n** | Coral TPU | `yolov8n_quant_edgetpu.tflite` |
| **YOLOv8n** | CPU | `yolov8n_quant.tflite` |
| **SSD MobileNet v2** | Coral TPU | `mobilenet_ssd_v2_coco_quant_postprocess_edgetpu.tflite` |
| **SSD MobileNet v2** | CPU | `mobilenet_ssd_v2_coco_quant_postprocess.tflite` |

---

## ⚡ Performance Optimization: NMS

VibeNVR implements **Non-Maximum Suppression (NMS)** for YOLOv8 models. This technique prevents the system from reporting the same object multiple times (e.g., three "person" boxes for one human). 

- **IoU Threshold**: `0.45` (standard balanced filtering).
- **Result Limit**: Capped at **10 objects** per frame to ensure real-time stability on EdgeTPU and low-power CPUs.

---

## 🛠️ Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `AI: tflite-runtime not installed` | Requirements not installed | Rebuild the engine image |
| `AI: EdgeTPU not found or failed` | Coral not visible to container | Check USB passthrough (see above) |
| Detections always at CPU | `ai_hardware: tpu` but no TPU | Plug in the Coral and restart engine |
| Many false positives | Confidence threshold too low | Raise to 60–75% in camera AI settings |
| Recordings without object tags | Threshold raised after engine started | New events will have tags; old ones won't |
| `Permission denied` on USB | LXC apparmor/cgroup2 not configured | Follow the LXC config steps above |
