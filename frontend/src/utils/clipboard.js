export const copyToClipboard = (text, showToast) => {
    // Fallback for non-secure contexts (HTTP)
    const fallbackCopy = (textToCopy) => {
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            if (showToast) showToast('Copied to clipboard', 'success');
        } catch (err) {
            console.error('Fallback copy failed', err);
            if (showToast) showToast('Failed to copy', 'error');
        }
        document.body.removeChild(textArea);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => {
                if (showToast) showToast('Copied to clipboard', 'success');
            })
            .catch(err => {
                console.error('Clipboard API failed', err);
                fallbackCopy(text);
            });
    } else {
        fallbackCopy(text);
    }
};
