/**
 * @file 本文件提供了处理 Minecraft 服务器消息 (MOTD) 的工具函数。
 * 主要功能是将包含颜色代码的字符串或 JSON 格式的 MOTD 转换为 HTML，
 * 以便在网页上正确显示颜色和格式。
 */

import { MINECRAFT_COLOR_CODES, MINECRAFT_FORMATTING_CODES } from './constants';
import { Motd } from './types';

/**
 * 将 Minecraft MOTD (JSON 或包含颜色代码的字符串) 转换为 HTML 字符串。
 * @param motd - 需要解析的 MOTD 对象或字符串。
 * @param isBedrock - 是否处理基岩版风格的颜色代码（以 `^` 作为引导符）。如果为 `false`，则同时支持 `§` 和 `&` 作为引导符。
 * @returns - 一个代表 MOTD 的 HTML 字符串。
 */
export function motdToHtml(motd: Motd | string, isBedrock = false): string {
  if (typeof motd === 'string') {
    return legacyMotdToHtml(motd, isBedrock);
  }
  return jsonMotdToHtml(motd);
}

/**
 * 将 JSON 格式的 MOTD 对象递归地转换为 HTML。
 * 这是处理现代 Java 版服务器富文本 MOTD 的核心函数。
 * @param motd - MOTD 对象。
 * @returns - 代表该 MOTD 对象的 HTML 字符串。
 */
function jsonMotdToHtml(motd: Motd): string {
  let html = '';
  const style: string[] = [];
  if (motd.color) style.push(`color: ${motd.color}`);
  if (motd.bold) style.push('font-weight: bold;');
  if (motd.italic) style.push('font-style: italic;');
  if (motd.underlined) style.push('text-decoration: underline;');
  if (motd.strikethrough) style.push('text-decoration: line-through;');
  if (motd.obfuscated) style.push('/* obfuscated */');

  html += `<span style="${style.join(' ')}">${motd.text}</span>`;

  // 递归处理 extra 字段中的附加部分
  if (motd.extra) {
    for (const extra of motd.extra) {
      html += jsonMotdToHtml(extra);
    }
  }

  return html;
}

/**
 * 将包含传统颜色代码的字符串 MOTD 转换为 HTML。
 * - 对于 Java 版 (isBedrock=false)，支持 `§` 和 `&` 作为颜色代码引导符。
 * - 对于基岩版 (isBedrock=true)，支持 `^` 作为颜色代码引导符。
 * @param motd - 包含颜色代码的 MOTD 字符串。
 * @param isBedrock - 是否为基岩版。
 * @returns - 代表该 MOTD 的 HTML 字符串。
 */
function legacyMotdToHtml(motd: string, isBedrock = false): string {
  let textToParse = motd;
  const codeChar = isBedrock ? '^' : '§';

  // 许多 Java 版插件使用 & 作为 § 的替代品，这里仅在处理 Java 版 MOTD 时进行转换。
  if (!isBedrock) {
    textToParse = textToParse.replace(/&/g, '§');
  }

  const parts = textToParse.split(codeChar);
  let html = '';
  let style: string[] = [];

  for (const part of parts) {
    if (!part) continue;
    const code = part[0];
    const text = part.substring(1);

    if (MINECRAFT_COLOR_CODES[code]) {
      // 如果是颜色代码，重置样式并设置新颜色
      style = [`color: ${MINECRAFT_COLOR_CODES[code]}`];
    } else {
      // 如果是格式化代码，添加相应样式
      switch (MINECRAFT_FORMATTING_CODES[code]) {
        case 'bold':
          style.push('font-weight: bold;');
          break;
        case 'italic':
          style.push('font-style: italic;');
          break;
        case 'underline':
          style.push('text-decoration: underline;');
          break;
        case 'strikethrough':
          style.push('text-decoration: line-through;');
          break;
        case 'reset':
          // 重置所有样式
          style = [];
          break;
      }
    }
    html += `<span style="${style.join(' ')}">${text}</span>`;
  }

  return html;
}
