/**
 * @file 本文件提供用于验证 Minecraft 玩家名称合法性的工具函数。
 */

import { PLAYER_NAME_REGEX } from './constants';

/**
 * 检查一个字符串是否是合法的 Minecraft 玩家名称。
 * 合法规则：3-16 个字符，只能包含字母、数字和下划线。
 * @param name - 需要验证的玩家名称字符串。
 * @returns - 如果名称合法，返回 true，否则返回 false。
 */
export function isValidPlayerName(name: string): boolean {
  return PLAYER_NAME_REGEX.test(name);
}
