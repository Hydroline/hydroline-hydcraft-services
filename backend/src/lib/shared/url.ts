export function getPublicBaseUrl(): string {
  return (
    process.env.APP_PUBLIC_BASE_URL ||
    process.env.BETTER_AUTH_URL ||
    'http://localhost:3000'
  );
}

export function buildPublicUrl(pathname: string): string {
  const baseUrl = getPublicBaseUrl();
  return new URL(pathname, baseUrl).toString();
}
