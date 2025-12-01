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
    throw new Error('Missing valid player identifier');
  }
  if (/\s/.test(trimmed)) {
    throw new Error('Player identifier must not contain whitespace');
  }
  return trimmed;
}

function normalizePassword(value: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Please enter a new password');
  }
  if (/\s/.test(value)) {
    throw new Error('Password must not contain whitespace');
  }
  return value;
}
