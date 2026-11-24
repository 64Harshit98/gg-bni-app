import { Timestamp } from 'firebase/firestore';

// JSON.stringify turns a Firestore Timestamp into { seconds, nanoseconds[, type] }.
// Use as a JSON.parse reviver to turn those back into Timestamps, so data
// read from a local cache looks exactly like data read from Firestore
// (nested fields included, e.g. returnHistory[].returnedAt).
export const reviveTimestamps = (_key: string, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const v = value as { seconds?: unknown; nanoseconds?: unknown };
        if (
            typeof v.seconds === 'number' && typeof v.nanoseconds === 'number' &&
            Object.keys(v).every((k) => k === 'seconds' || k === 'nanoseconds' || k === 'type')
        ) {
            return new Timestamp(v.seconds, v.nanoseconds);
        }
    }
    return value;
};
