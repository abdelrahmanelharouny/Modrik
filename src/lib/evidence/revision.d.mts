export interface EvidenceRevisionSnapshot {
  title: string;
  content: string;
  sourceType: string;
  language: string;
  consent: boolean;
}
export function hashEvidenceRevision(snapshot: EvidenceRevisionSnapshot): string;
export function sameEvidenceRevision(left: EvidenceRevisionSnapshot, right: EvidenceRevisionSnapshot): boolean;
