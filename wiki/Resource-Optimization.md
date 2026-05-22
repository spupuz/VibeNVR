# Resource Optimization Guide

VibeNVR is designed to be lightweight, but video processing is inherently resource-intensive. Depending on your configuration, RAM and CPU usage can vary significantly. This guide explains how to estimate your hardware needs and optimize VibeNVR for maximum efficiency.

---

## 🚀 RAM Estimation per Camera

Memory consumption primarily depends on **Resolution** and **Pre-Capture** settings.

### 1. "Light" Scenario (Streaming & Motion Only)
Used when **Passthrough Recording** is enabled OR **Pre-Capture** is disabled. In this mode, only the latest frame is decoded in raw format for AI/Motion analysis and UI delivery.

*   **Estimated RAM**: 40MB - 80MB per camera.
*   **Context**: Fixed consumption regardless of resolution (since high-res streams are handled in their compressed state via passthrough).

### 2. "Buffered" Scenario (Pre-Capture Enabled)
Used when **Passthrough Recording** is disabled and high-resolution raw frames are buffered in RAM to allow capturing the moments *before* an event starts.

**Formula:**
`Resolution (W * H) * 3 bytes (BGR) * Buffer Size (Total Frames)`

| Resolution | 5s Pre-Capture (@15 fps) | RAM per Camera |
| :--- | :--- | :--- |
| **720p** (1280x720) | 75 frames | ~210 MB |
| **1080p** (1920x1080) | 75 frames | ~460 MB |
| **4K** (3840x2160) | 75 frames | ~1.8 GB |

---

## 🛠️ Optimization Strategies

If you notice high memory usage or CPU spikes, apply these rules in order of impact:

### 1. Enable Passthrough Recording
Set `movie_passthrough: true` in the camera settings.
*   **Impact**: Disables the raw BGR buffer for recording. 
*   **Result**: RAM consumption stays fixed (< 100MB) even for 4K cameras. 
*   **Trade-off**: You cannot burn OSD overlays or privacy masks into the recorded file (they will only appear in the Live View).

### 2. Use Sub-Streams (Highly Recommended)
Configure a low-resolution **Sub-Stream** (e.g., 640x480) for detection while keeping the **Main Stream** for recording.
*   **Impact**: AI and Motion detection run on the small image, drastically reducing CPU load.
*   **Result**: Recording still uses the high-res stream via passthrough, giving you the best of both worlds.

### 3. Pre-Capture Throttling
Adjust the `Pre-Capture Buffer FPS Divisor` (e.g., set it to `3`).
*   **Impact**: Stores only 1 frame for every 3 frames received.
*   **Result**: Reduces RAM usage by 66% while still providing a smooth pre-event buffer.

### 4. Hardware Acceleration (Coral TPU)
Offload AI inference to a **Google Coral Edge TPU**.
*   **Impact**: Moves heavy mathematical calculations from the CPU to dedicated hardware.
*   **Result**: CPU usage drops significantly, allowing for more cameras or higher detection frequencies. See the **[AI Detection Guide](AI-Detection.md)** for setup details.

---

## ⚡ Hardware Offloading (GPU & TPU)

To scale VibeNVR beyond a few cameras, leveraging dedicated hardware is the most effective strategy.

### 🎥 GPU Acceleration (Video Processing)
Modern CPUs have integrated graphics (Intel/AMD) or you may have a dedicated NVIDIA card. Using these via **VAAPI** or **NVIDIA Container Toolkit** allows VibeNVR to offload video decoding and encoding.

*   **How it helps**: When VibeNVR needs to decode a stream for motion detection or re-encode it for specific recording modes, the GPU does the heavy lifting.
*   **Performance Impact**: Can reduce CPU usage by **40-70%** on systems with many high-resolution cameras.
*   **Configuration**: 
    - Set `HW_ACCEL=true` in your `docker-compose.yml`.
    - Ensure `/dev/dri` is passed to the engine container (for Intel/AMD).
    - See the **[Installation Guide](Installation.md)** for detailed hardware-specific steps.

### 🧠 TPU Acceleration (AI Inference)
The **Google Coral USB Accelerator** is a specialized processor for machine learning.

*   **How it helps**: AI object detection (finding people, cars, etc.) is extremely CPU-intensive. A TPU can perform these calculations in **~10ms**, whereas a standard CPU might take **300ms+**.
*   **Performance Impact**: Moves almost **100% of AI-related load** off your CPU. This prevents "stuttering" in video processing and allows the system to remain responsive even during multiple simultaneous detection events.
*   **Scalability**: With a TPU, you can easily run AI detection on 10+ cameras simultaneously on a low-power Mini-PC that would otherwise be at 100% CPU with just 2 cameras.

---

## 📊 Summary Budget

| Configuration | RAM / Camera | CPU Impact |
| :--- | :--- | :--- |
| **Optimized** (Passthrough + Sub-stream) | ~60 MB | Very Low |
| **Standard** (720p Pre-capture) | ~250 MB | Moderate |
| **Heavy** (1080p Pre-capture, No Sub-stream) | ~500 MB | High |
| **Extreme** (4K, No Passthrough) | ~2 GB | Very High |

> [!TIP]
> For most users, the **Optimized** configuration is the sweet spot. Use a 640x480 sub-stream for detection and enable Passthrough on the 4K/2K main stream for crystal-clear recordings with minimal resource footprint.
