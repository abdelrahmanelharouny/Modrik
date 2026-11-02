export function csvCell(value) {
  let raw = value == null ? "" : String(value);
  // Spreadsheet applications may interpret formulas after leading whitespace.
  // Prefix only untrusted string cells; negative numeric measurements remain numeric.
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(raw)) raw = "'" + raw;
  return '"' + raw.replace(/"/g, '""') + '"';
}
