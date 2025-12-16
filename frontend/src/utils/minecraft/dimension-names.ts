// Utility to convert Minecraft dimension identifiers to user-friendly names

const DIMENSION_NAME_MAP: Record<string, string> = {
  'minecraft:overworld': '主世界',
  'minecraft:the_nether': '地狱',
  'minecraft:the_end': '末地',
  DIM1: '末地',
  'DIM-1': '地狱',
}

/**
 * Converts a Minecraft dimension identifier to a user-friendly name.
 * @param dimensionId - The dimension identifier (e.g., "minecraft:overworld").
 * @returns The user-friendly name, or the original identifier if no mapping exists.
 */
export function getDimensionName(
  dimensionId: string | null | undefined,
): string {
  if (!dimensionId) return '未知维度'
  return DIMENSION_NAME_MAP[dimensionId] || dimensionId
}
