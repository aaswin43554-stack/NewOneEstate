// Shared numeric-input validation.
//
// Postgres INTEGER columns overflow above 2,147,483,647. When a user pastes an
// oversized value (e.g. a phone number into a quantity field) the INSERT throws
// and surfaces as an opaque 500. These helpers validate up-front so callers can
// return a clear 400 instead.

const PG_INT_MAX = 2147483647;

// Validate that `raw` is an integer within [min, max].
// Returns { ok: true, value } or { ok: false, error }.
function intInRange(raw, { field = 'Value', min = 0, max = PG_INT_MAX } = {}) {
  const n = Number(raw);
  if (raw === '' || raw === null || raw === undefined || !Number.isInteger(n)) {
    return { ok: false, error: `${field} must be a whole number.` };
  }
  if (n < min || n > max) {
    return { ok: false, error: `${field} must be between ${min.toLocaleString()} and ${max.toLocaleString()}.` };
  }
  return { ok: true, value: n };
}

// Validate each field in `specs` against req.body. `specs` is an array of
// { key, label?, min?, max?, required?, allowNegative? }.
// Returns { ok: true, values } with parsed integers, or { ok: false, error }
// on the first failure. Optional fields that are null/undefined are skipped.
function validateInts(body, specs) {
  const values = {};
  for (const s of specs) {
    const raw = body[s.key];
    const absent = raw === undefined || raw === null || raw === '';
    if (absent) {
      if (s.required) return { ok: false, error: `${s.label || s.key} is required.` };
      continue;
    }
    const min = s.min != null ? s.min : (s.allowNegative ? -PG_INT_MAX : 0);
    const max = s.max != null ? s.max : PG_INT_MAX;
    const res = intInRange(raw, { field: s.label || s.key, min, max });
    if (!res.ok) return res;
    values[s.key] = res.value;
  }
  return { ok: true, values };
}

module.exports = { intInRange, validateInts, PG_INT_MAX };
