// Host-independent NFC + locale-independent casing; not full Unicode folding.
// Use only to detect collisions. Exact spelling still identifies a file.
export const pathCollisionKey = file => file.normalize('NFC').toLowerCase();
