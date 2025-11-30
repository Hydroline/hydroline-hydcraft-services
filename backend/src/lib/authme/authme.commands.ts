export function buildAuthmeChangePasswordCommand(
  identifier: string,
  newPassword: string,
) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  const normalizedPassword = normalizePassword(newPassword);
  return `authme changepassword ${normalizedIdentifier} ${normalizedPassword}`;
}

export function buildAuthmeForceLoginCommand(identifier: string) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  return `authme forcelogin ${normalizedIdentifier}`;
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

function normalizePassword(value: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('请输入新密码');
  }
  if (/\s/.test(value)) {
    throw new Error('密码不能包含空白字符');
  }
  return value;
}
