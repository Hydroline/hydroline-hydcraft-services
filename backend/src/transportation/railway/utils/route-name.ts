export function extractRouteDisplayName(value: string | null | undefined) {
  if (!value) return null;
  const raw = value.split('||')[0]?.trim();
  return raw || null;
}

export function extractRouteBaseKey(value: string | null | undefined) {
  if (!value) return null;
  const raw = value.split('||')[0]?.split('|')[0]?.trim().toLowerCase();
  return raw || null;
}

export function extractRouteVariantLabel(value: string | null | undefined) {
  if (!value) return null;
  const doubleParts = value.split('||');
  if (doubleParts.length >= 2) {
    const candidate = doubleParts[1]?.split('|')[0]?.trim();
    return candidate || null;
  }
  const singleParts = doubleParts[0]?.split('|') ?? [];
  if (singleParts.length >= 2) {
    const candidate = singleParts[1]?.trim();
    return candidate || null;
  }
  return null;
}
