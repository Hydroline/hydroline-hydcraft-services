/**
 * @file 本文件定义了 Minecraft 工具集所需的所有 TypeScript 接口和类型。
 * 这些类型为 Ping 响应、MOTD 结构等提供了统一的数据模型。
 */

/**
 * Ping 服务器时可用的选项。
 */
export interface PingOptions {
  /**
   * 服务器端口，默认为 Java 版的 25565 或基岩版的 19132。
   */
  port?: number;
  /**
   * Ping 的超时时间，单位为毫秒，默认为 5000。
   */
  timeout?: number;
  /**
   * 用于 Ping 的协议版本号，主要用于 Java 版。
   */
  protocolVersion?: number;
}

/**
 * Ping Minecraft Java 版服务器后返回的数据结构。
 */
export interface JavaPingResponse {
  /**
   * 服务器版本信息。
   */
  version: {
    /**
     * 版本名称，例如 "1.19.4"。
     */
    name: string;
    /**
     * 协议版本号，例如 762。
     */
    protocol: number;
  };
  /**
   * 在线玩家信息。
   */
  players: {
    /**
     * 当前在线玩家数。
     */
    online: number;
    /**
     * 服务器最大玩家数。
     */
    max: number;
    /**
     * 在线玩家列表样本（部分服务器提供）。
     */
    sample?: { name: string; id: string }[];
  };
  /**
   * 服务器消息 (MOTD)，可以是解析后的 JSON 结构或原始字符串。
   */
  description: Motd | string;
  /**
   * 服务器图标，通常为 Base64 编码的 PNG 图片。
   */
  favicon?: string;
  /**
   * Ping 的延迟，单位为毫秒。
   */
  latency: number;
}

/**
 * Ping Minecraft 基岩版服务器后返回的数据结构。
 */
export interface BedrockPingResponse {
  /**
   * 游戏版本，例如 "MCPE" 或 "MCEE"。
   */
  edition: string;
  /**
   * 服务器消息 (MOTD) 字符串。
   */
  motd: string;
  /**
   * 协议版本号。
   */
  protocolVersion: string;
  /**
   * 服务器版本名称，例如 "1.18.30"。
   */
  version: string;
  /**
   * 在线玩家信息。
   */
  players: {
    /**
     * 当前在线玩家数。
     */
    online: number;
    /**
     * 服务器最大玩家数。
     */
    max: number;
  };
  /**
   * 默认游戏模式。
   */
  gamemode: string;
  /**
   * 服务器的唯一 ID。
   */
  serverId: string;
  /**
   * Ping 的延迟，单位为毫秒。
   */
  latency: number;
}

/**
 * 描述 Minecraft 服务器消息 (MOTD) 的 JSON 结构。
 * 现代 Java 版服务器使用此格式来支持富文本 MOTD。
 */
export interface Motd {
  /**
   * 文本内容。
   */
  text: string;
  /**
   * 附加的 MOTD 片段，用于实现复杂的格式。
   */
  extra?: Motd[];
  /**
   * 文本颜色。
   */
  color?: string;
  /**
   * 是否为粗体。
   */
  bold?: boolean;
  /**
   * 是否为斜体。
   */
  italic?: boolean;
  /**
   * 是否有下划线。
   */
  underlined?: boolean;
  /**
   * 是否有删除线。
   */
  strikethrough?: boolean;
  /**
   * 是否为随机混淆字符。
   */
  obfuscated?: boolean;
}
