function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function byKey(rows, key) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row && typeof row[key] === "string" && row[key]) map.set(row[key], row);
  }
  return map;
}
function fieldsChanged(before, after, fields) {
  const changed = {};
  for (const field of fields) {
    const left = before?.[field] ?? null, right = after?.[field] ?? null;
    if (JSON.stringify(left) !== JSON.stringify(right)) changed[field] = { from: left, to: right };
  }
  return changed;
}
function compareCollection(before, after, key, fields) {
  const left = byKey(before, key), right = byKey(after, key);
  const added = [], removed = [], changed = [];
  for (const [id, item] of right) {
    if (!left.has(id)) added.push({ key: id, item });
    else {
      const changes = fieldsChanged(left.get(id), item, fields);
      if (Object.keys(changes).length) changed.push({ key: id, changes });
    }
  }
  for (const [id, item] of left) if (!right.has(id)) removed.push({ key: id, item });
  return { added, removed, changed, totalChanges: added.length + removed.length + changed.length };
}
export function compareBaselineSnapshots(beforeInput, afterInput) {
  const before = object(beforeInput), after = object(afterInput);
  const requirements = compareCollection(before.requirements, after.requirements, "refId", ["text","type","priority","status","ambiguity","confidence","verifyStatus","driftStatus","links"]);
  const stories = compareCollection(before.stories, after.stories, "refId", ["title","narrative","acceptance","status","investScore"]);
  const conflicts = compareCollection(before.conflicts, after.conflicts, "id", ["kind","severity","description","status","resolution"]);
  return {
    from: before.version ?? null,
    to: after.version ?? null,
    requirements, stories, conflicts,
    totalChanges: requirements.totalChanges + stories.totalChanges + conflicts.totalChanges,
  };
}
