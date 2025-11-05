/**
 * @file 本文件包含了所有与 Minecraft 相关的常量，
 * 例如颜色代码、格式化代码、正则表达式以及用于协议通信的特殊值。
 * 将这些常量集中管理，便于维护和重用。
 */

/**
 * Minecraft 颜色代码及其对应的十六进制颜色值。
 * 用于将游戏内的颜色代码（如 §c）转换为 HTML/CSS 可识别的颜色。
 */
export const MINECRAFT_COLOR_CODES: Record<string, string> = {
  '0': '#000000', // black
  '1': '#0000AA', // dark_blue
  '2': '#00AA00', // dark_green
  '3': '#00AAAA', // dark_aqua
  '4': '#AA0000', // dark_red
  '5': '#AA00AA', // dark_purple
  '6': '#FFAA00', // gold
  '7': '#AAAAAA', // gray
  '8': '#555555', // dark_gray
  '9': '#5555FF', // blue
  a: '#55FF55', // green
  b: '#55FFFF', // aqua
  c: '#FF5555', // red
  d: '#FF55FF', // light_purple
  e: '#FFFF55', // yellow
  f: '#FFFFFF', // white
};

/**
 * Minecraft 文本格式化代码及其对应的 CSS 样式或标识。
 * 用于处理粗体、斜体、下划线等文本格式。
 */
export const MINECRAFT_FORMATTING_CODES: Record<string, string> = {
  k: 'obfuscated',
  l: 'bold',
  m: 'strikethrough',
  n: 'underline',
  o: 'italic',
  r: 'reset',
};

/**
 * 用于验证带短横线的 UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) 的正则表达式。
 */
export const UUID_REGEX_DASHED =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 用于验证不带短横线的 UUID (xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx) 的正则表达式。
 */
export const UUID_REGEX_UNDASHED = /^[0-9a-f]{32}$/i;

/**
 * 用于验证 Minecraft 玩家名称的正则表达式。
 * 规则：3-16 个字符，只能包含字母、数字和下划线。
 */
export const PLAYER_NAME_REGEX = /^[a-zA-Z0-9_]{3,16}$/;

/**
 * 用于 Ping Minecraft 基岩版服务器的 UDP 协议的魔术字节序列。
 * 这是基岩版服务器识别 Ping 请求的关键标识。
 */
export const BEDROCK_MAGIC = Buffer.from([
  0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe,
  0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78,
]);
