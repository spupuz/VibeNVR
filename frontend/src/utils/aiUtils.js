/**
 * ⚡ Bolt: Fast parsing of comma separated AI metadata labels.
 * Avoids creating multiple intermediate arrays by using a single pass loop.
 */
export const parseAILabels = (ai_metadata) => {
    if (!ai_metadata) return [];
    const arr = ai_metadata.split(',');
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const val = arr[i].trim().toLowerCase();
        if (val && !result.includes(val)) {
            result.push(val);
        }
    }
    return result;
};
