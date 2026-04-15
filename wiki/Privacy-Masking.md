# Privacy Masking & Motion Zones

VibeNVR supports drawing custom polygons to obscure sensitive areas or exclude regions from motion detection.

## 🔒 Privacy Masks

Privacy Masks are used to permanently black out specific areas of the camera feed. 

*   **Permanent**: Masks are "burned" into the video frames at the engine level.
*   **Security**: When a Privacy Mask is active, **Passthrough Recording is automatically disabled** (both at the engine and UI level). This ensures that the mask cannot be bypassed by recording the raw stream and gives clear visual feedback in the configuration interface.
*   **Affects Everything**: The masked areas will appear black in Live View, Snapshots, and all Recordings.
*   **Motion Detection**: Privacy masks also prevent motion triggers in those areas.

## 🛡️ Motion Zones (Exclusion)

Motion Zones allow you to define areas that the motion detection engine should ignore.

*   **Exclusion Only**: These zones do NOT obscure the video. The areas remain fully visible in recordings and live view.
*   **False Trigger Reduction**: Use this to ignore trees blowing in the wind, busy roads, or other areas with constant motion that you don't want to trigger alerts for.
*   **ONVIF Edge Note**: If you select **ONVIF Edge** as your detection engine, the Motion Zones tab will be automatically hidden, as the camera's hardware handles exclusion logic natively on its sensor.

## How to Configure

1.  Go to **Settings** -> **Cameras**.
2.  Edit the desired camera.
3.  Select the **Privacy Mask** or **Motion Zones** tab.
4.  Click on the snapshot to start drawing a polygon.
5.  Click back on the first point (green) to close the area.
6.  Click **Save Changes** at the bottom of the camera settings.
