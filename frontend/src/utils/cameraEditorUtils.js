import { DEFAULT_CAMERA_STATE } from '../constants/cameraDefaults';
import { parseRtspUrl } from './cameraUtils';

export const createCameraDraft = () => ({
    ...DEFAULT_CAMERA_STATE,
    rtsp_username: '',
    rtsp_password: '',
    rtsp_host: '',
    max_storage_gb: 0,
    notify_attach_image_email: true,
    notify_attach_image_telegram: true
});

export const cameraToDraft = (camera) => {
    const { user, pass, host } = parseRtspUrl(camera.rtsp_url);
    return { ...camera, rtsp_username: user, rtsp_password: pass, rtsp_host: host };
};

// Used only in memory. Never persist or log draft snapshots: they contain credentials.
export const cameraDraftSnapshot = (camera) => JSON.stringify(
    Object.fromEntries(Object.entries(camera)
        .filter(([key]) => key !== 'show_password')
        .sort(([left], [right]) => left.localeCompare(right)))
);
