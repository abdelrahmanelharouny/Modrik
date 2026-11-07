const COLUMNS = Object.freeze(["id", "createdAt", "stage", "actor", "action", "detail"]);
function cell(value) {
  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  if (/^[\u0000-\u0020]*[=+@\-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function auditRowsToCsv(rows) {
  if (!Array.isArray(rows)) throw new TypeError("Audit rows must be an array");
  return "\uFEFF" + [
    COLUMNS.map(cell).join(","),
    ...rows.map((row) => COLUMNS.map((column) => cell(row[column])).join(",")),
  ].join("\r\n") + "\r\n";
}
