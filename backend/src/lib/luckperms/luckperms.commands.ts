export function buildLuckpermsSetParentCommand(
  identifier: string,
  group: string,
) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  const normalizedGroup = normalizeGroup(group);
  return `/lp user ${normalizedIdentifier} parent set ${normalizedGroup}`;
}

function normalizeIdentifier(value: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error('Missing valid player identifier');
  }
  if (/\s/.test(trimmed)) {
    throw new Error('Player identifier must not contain whitespace');
  }
  return trimmed;
}

function normalizeGroup(value: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error('Target permission group is required');
  }
  if (/\s/.test(trimmed)) {
    throw new Error('Permission group identifier must not contain whitespace');
  }
  return trimmed;
}
