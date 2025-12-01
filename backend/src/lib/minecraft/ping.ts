/**
 * @file 本文件提供了 Ping Minecraft Java 版和基岩版服务器的工具函数。
 * 它封装了两种版本服务器的 Ping 协议，支持获取服务器状态，
 * 包括版本、在线人数、MOTD 等信息。
 *
 * @comment 本文件的 Java 版 Ping 功能由 `mcping-js` 库驱动，基岩版 Ping 功能使用原生 UDP 实现，以确保稳定性和可靠性。
 */

import * as dns from 'dns/promises';
import * as dgram from 'dgram';
import { BEDROCK_MAGIC } from './constants';
import { BedrockPingResponse, JavaPingResponse, PingOptions } from './types';
import { MinecraftServer } from 'mcping-js';

/**
 * Ping 一个 Minecraft Java 版服务器。
 * 本函数会自动处理 SRV 记录解析。
 * @param host - 服务器地址 (域名或 IP)。
 * @param options - Ping 选项，如端口和超时。
 * @returns - 一个 Promise，解析为包含服务器状态的 `JavaPingResponse` 对象。
 */
export async function pingJava(
  host: string,
  options: PingOptions = {},
): Promise<JavaPingResponse> {
  const { port = 25565, timeout = 10000, protocolVersion = 758 } = options;
  const startTime = Date.now();

  const srv = await resolveSrv(host);
  const targetHost = srv?.host ?? host;
  const targetPort = srv?.port ?? port;

  return new Promise<JavaPingResponse>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const server = new MinecraftServer(targetHost, targetPort);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    server.ping(timeout, protocolVersion, (err: unknown, res: unknown) => {
      if (err) {
        // 确保 Promise 使用 Error 实例作为拒绝原因
        const reason =
          err instanceof Error
            ? err
            : new Error(typeof err === 'string' ? err : 'Ping 请求失败');
        return reject(reason);
      }
      const raw = res as JavaPingResponse;
      const latency = Date.now() - startTime;
      resolve({
        ...raw,
        latency,
      });
    });
  });
}

/**
 * Ping 一个 Minecraft 基岩版服务器。
 * @param host - 服务器地址 (域名或 IP)。
 * @param options - Ping 选项，如端口和超时。
 * @returns - 一个 Promise，解析为包含服务器状态的 `BedrockPingResponse` 对象。
 */
export function pingBedrock(
  host: string,
  options: PingOptions = {},
): Promise<BedrockPingResponse> {
  const { port = 19132, timeout = 10000 } = options;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');

    // 构造 Unconnected Ping 数据包
    // 格式：0x01 | timestamp (8 bytes) | magic (16 bytes) | client GUID (8 bytes)
    const timestamp = Buffer.alloc(8);
    timestamp.writeBigUInt64BE(BigInt(startTime));

    const clientGuid = Buffer.alloc(8);
    clientGuid.writeBigUInt64BE(BigInt(Math.floor(Math.random() * 0xffffffff)));

    const request = Buffer.concat([
      Buffer.from([0x01]), // Unconnected Ping packet ID
      timestamp,
      BEDROCK_MAGIC,
      clientGuid,
    ]);

    const timeoutHandle = setTimeout(() => {
      client.close();
      reject(new Error('Ping 超时。'));
    }, timeout);

    client.on('error', (err) => {
      clearTimeout(timeoutHandle);
      client.close();
      reject(err);
    });

    client.on('message', (msg) => {
      clearTimeout(timeoutHandle);
      client.close();

      try {
        // 验证响应格式：0x1c | timestamp | server GUID | magic | string length | server info
        if (msg.length < 35 || msg[0] !== 0x1c) {
          throw new Error('Invalid Bedrock Ping response format.');
        }

        // 跳过：packet ID (1) + timestamp (8) + server GUID (8) + magic (16) = 33 字节
        // 然后读取字符串长度 (2 字节，大端序)
        const stringLength = msg.readUInt16BE(33);

        // 读取服务器信息字符串
        const serverInfoString = msg.toString('utf8', 35, 35 + stringLength);

        // 解析分号分隔的服务器信息
        // 格式：Edition;MOTD;Protocol;Version;Players;Max;ServerID;MOTD2;Gamemode;GamemodeNum;Port4;Port6
        const parts = serverInfoString.split(';');

        if (parts.length < 6) {
          throw new Error('Server information format is incomplete.');
        }

        const response: BedrockPingResponse = {
          edition: parts[0] || 'MCPE',
          motd: parts[1] || '',
          protocolVersion: parts[2] || '0',
          version: parts[3] || '',
          players: {
            online: parseInt(parts[4]) || 0,
            max: parseInt(parts[5]) || 0,
          },
          gamemode: parts.length > 8 ? parts[8] : 'Survival',
          serverId: parts.length > 6 ? parts[6] : '',
          latency: Date.now() - startTime,
        };

        resolve(response);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        reject(new Error(`解析基岩版 Ping 响应失败：${msg}`));
      }
    });

    client.send(request, 0, request.length, port, host, (err) => {
      if (err) {
        clearTimeout(timeoutHandle);
        client.close();
        reject(err);
      }
    });
  });
}

/**
 * 解析域名的 SRV 记录，以找到 Minecraft 服务器的真实主机和端口。
 * @param host - 要查询的域名。
 * @returns - 如果找到 SRV 记录，则返回包含主机和端口的对象，否则返回 null。
 */
async function resolveSrv(
  host: string,
): Promise<{ host: string; port: number } | null> {
  try {
    const records = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (records.length > 0) {
      return { host: records[0].name, port: records[0].port };
    }
    return null;
  } catch {
    return null;
  }
}
