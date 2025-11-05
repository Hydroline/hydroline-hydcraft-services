/**
 * @file 本文件提供了处理 Minecraft 玩家 UUID 的工具函数，
 * 包括验证 UUID 格式的合法性，以及在有横线和无横线的格式之间进行转换。
 */

import { UUID_REGEX_DASHED, UUID_REGEX_UNDASHED } from './constants';

/**
 * 检查一个字符串是否是合法的 Minecraft UUID (支持带横线和不带横线两种格式)。
 * @param uuid - 需要验证的 UUID 字符串。
 * @returns - 如果 UUID 合法，返回 true，否则返回 false。
 */
export function isValidUuid(uuid: string): boolean {
  return UUID_REGEX_DASHED.test(uuid) || UUID_REGEX_UNDASHED.test(uuid);
}

/**
 * 将一个不带横线的 UUID 字符串转换为带横线的标准格式。
 * 如果输入字符串格式不正确，将原样返回。
 * @param undashedUuid - 不带横线的 UUID 字符串。
 * @returns - 带横线的 UUID 字符串。
 */
export function addUuidDashes(undashedUuid: string): string {
  if (!UUID_REGEX_UNDASHED.test(undashedUuid)) {
    return undashedUuid;
  }
  return `${undashedUuid.substring(0, 8)}-${undashedUuid.substring(
    8,
    12,
  )}-${undashedUuid.substring(12, 16)}-${undashedUuid.substring(
    16,
    20,
  )}-${undashedUuid.substring(20)}`;
}

/**
 * 将一个带横线的 UUID 字符串转换为不带横线的格式。
 * 如果输入字符串格式不正确，将原样返回。
 * @param dashedUuid - 带横线的 UUID 字符串。
 * @returns - 不带横线的 UUID 字符串。
 */
export function removeUuidDashes(dashedUuid: string): string {
  if (!UUID_REGEX_DASHED.test(dashedUuid)) {
    return dashedUuid;
  }
  return dashedUuid.replace(/-/g, '');
}
