export declare function canonicalJson(value: unknown): string;
export declare function buildCompliancePackage(payload: Record<string,unknown>, generatedAt?:Date): {manifest:{schemaVersion:string;generatedAt:string;hashAlgorithm:"SHA-256";sha256:string};body:Record<string,unknown>};
