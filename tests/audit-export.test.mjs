import test from "node:test";
import assert from "node:assert/strict";
import { auditRowsToCsv } from "../src/lib/audit-export.mjs";

test("audit CSV quotes all fields and preserves commas, quotes and line breaks", () => {
 const csv=auditRowsToCsv([{id:"1",createdAt:"2026-11-03T12:00:00.000Z",stage:"LIFECYCLE",actor:"human",action:"note",detail:'said "hello", then\nleft'}]);
 assert.ok(csv.startsWith("\uFEFF"));
 assert.match(csv,/"said ""hello"", then\nleft"/);
});
test("audit CSV neutralizes formulas including leading whitespace", () => {
 const csv=auditRowsToCsv([{id:"=HYPERLINK(1)",createdAt:"",stage:"+SUM(A1)",actor:"@cmd",action:"-1+1",detail:"  =1+1"}]);
 assert.match(csv,/"'=HYPERLINK\(1\)"/);
 assert.match(csv,/"'\+SUM\(A1\)"/);
 assert.match(csv,/"'@cmd"/);
 assert.match(csv,/"'-1\+1"/);
 assert.match(csv,/"'  =1\+1"/);
});
test("audit CSV rejects non-array input", () => {
 assert.throws(()=>auditRowsToCsv({}),/must be an array/);
});
