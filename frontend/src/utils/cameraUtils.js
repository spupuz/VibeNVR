/**
 * Parses an RTSP URL into components (user, pass, host).
 * @param {string} url - The RTSP URL to parse.
 * @returns {object} - An object containing user, pass, and host.
 */
export const parseRtspUrl = (url) => {
    let user = '', pass = '', host = url || '';
    if (!url) return { user, pass, host };

    try {
        // Handle various formats: 
        // 1. rtsp://user:pass@host:port/path
        // 2. rtsp://user@host:port/path
        // 3. rtsp://host:port/path
        const withoutProto = url.replace(/^(rtsp|http|https|rtmp):\/\//, '');

        if (withoutProto.includes('@')) {
            const atIndex = withoutProto.lastIndexOf('@');
            const authPart = withoutProto.substring(0, atIndex);
            host = withoutProto.substring(atIndex + 1);

            if (authPart.includes(':')) {
                const colonIndex = authPart.indexOf(':');
                user = authPart.substring(0, colonIndex);
                pass = authPart.substring(colonIndex + 1);
            } else {
                user = authPart;
            }
        } else {
            host = withoutProto;
        }
    } catch (e) {
        console.error("URL parsing error", e);
    }
    // Decode URL-encoded credentials for display (e.g., %21 -> !)
    try {
        user = decodeURIComponent(user);
        pass = decodeURIComponent(pass);
    } catch (e) {
        // Keep as-is if decoding fails
    }
    return { user, pass, host };
};
