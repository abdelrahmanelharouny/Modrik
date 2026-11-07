export interface AuditExportRow {
  id: string; createdAt: string | Date; stage: string; actor: string; action: string; detail: string;
}
export function auditRowsToCsv(rows: AuditExportRow[]): string;
