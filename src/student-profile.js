export function savedProfile(previous, edited, requiredOnly = false) {
  const fields = requiredOnly ? ['department', 'year', 'status'] : Object.keys(edited);
  const saved = { ...previous };
  for (const key of fields) {
    const value = edited[key];
    saved[key] = typeof value === 'string' ? value.trim() : value;
  }
  return saved;
}
