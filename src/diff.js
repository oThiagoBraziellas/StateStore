/** Structural diff used by the debugger to show what an action changed. */

const isObject = (v) => v !== null && typeof v === 'object';

export function diffState(before, after, path = '') {
  if (Object.is(before, after)) return [];
  if (!isObject(before) || !isObject(after) || Array.isArray(before) !== Array.isArray(after)) {
    return [{ path: path || '(root)', before, after }];
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out = [];
  for (const key of keys) {
    const child = Array.isArray(before) ? `${path}[${key}]` : path ? `${path}.${key}` : key;
    if (!(key in before)) out.push({ path: child, before: undefined, after: after[key] });
    else if (!(key in after)) out.push({ path: child, before: before[key], after: undefined });
    else out.push(...diffState(before[key], after[key], child));
  }
  return out;
}
