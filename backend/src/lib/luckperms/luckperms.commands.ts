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
    throw new Error('缺少合法的玩家标识');
  }
  if (/\s/.test(trimmed)) {
    throw new Error('玩家标识不能包含空白字符');
  }
  return trimmed;
}

function normalizeGroup(value: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error('缺少目标权限组');
  }
  if (/\s/.test(trimmed)) {
    throw new Error('权限组标识不能包含空白字符');
  }
  return trimmed;
}
