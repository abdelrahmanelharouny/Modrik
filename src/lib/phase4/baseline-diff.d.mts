export declare function compareBaselineSnapshots(before: unknown, after: unknown): {from:number|null;to:number|null;requirements:unknown;stories:unknown;conflicts:unknown;totalChanges:number};

export declare function verifyBaselineSnapshotIntegrity(snapshotJson: unknown, expectedHash: unknown): boolean;
