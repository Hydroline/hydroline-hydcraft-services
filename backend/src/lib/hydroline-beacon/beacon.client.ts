import { HttpException, Logger } from '@nestjs/common';

// 否则直接用会出问题
// 使用 CommonJS 形式加载 socket.io-client 以兼容 v2 的导出结构
const socketIo =
  require('socket.io-client') as typeof import('socket.io-client');

export type HydrolineBeaconEvent =
  | 'force_update'
  | 'get_player_advancements'
  | 'get_player_stats'
  | 'list_online_players'
  | 'get_server_time'
  | 'get_player_mtr_logs'
  | 'get_mtr_log_detail'
  | 'get_player_sessions'
  | 'get_status'
  | 'get_player_nbt'
  | 'lookup_player_identity'
  | 'list_player_identities'
  | 'get_players_data'
  | 'get_player_balance'
  | 'set_player_balance'
  | 'add_player_balance';

export interface HydrolineBeaconClientOptions {
  endpoint: string;
  key: string;
  timeoutMs?: number;
  maxRetry?: number;
}

export interface EmitOptions {
  timeoutMs?: number;
}

type Socket = ReturnType<typeof socketIo>;

export class HydrolineBeaconClient {
  private socket: Socket | null = null;
  private connecting = false;
  private lastError: string | null = null;
  private lastConnectedAt: Date | null = null;
  private reconnectAttempts = 0;
  private initialOptions: HydrolineBeaconClientOptions;
  private readonly logger = new Logger(
    `BeaconClient: ${(() => {
      return '';
    })()}`,
  );

  constructor(private readonly options: HydrolineBeaconClientOptions) {
    this.initialOptions = { ...options };
    (this.logger as any).context = `BeaconClient: ${this.options.endpoint}`;
  }

  private ensureSocket(): Socket {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }
    if (this.connecting && this.socket) {
      return this.socket;
    }
    this.connecting = true;
    const socket: Socket = socketIo(this.options.endpoint, {
      transports: ['websocket', 'polling'],
      reconnection: false,
      timeout: this.options.timeoutMs ?? 10000,
    });
    this.socket = socket;
    socket.on('connect', () => {
      this.connecting = false;
      this.lastConnectedAt = new Date();
      this.lastError = null;
      this.reconnectAttempts = 0;
      this.logger.log(
        `Connection established (attempts: ${this.reconnectAttempts})`,
      );
    });
    socket.on('disconnect', () => {
      this.connecting = false;
      this.logger.debug('Disconnected from beacon server');
    });
    socket.on('connect_error', (err: Error) => {
      this.lastError = err.message;
      this.reconnectAttempts++;
      this.logger.warn(
        `Connection error (attempt ${this.reconnectAttempts}): ${err.message}`,
      );
    });
    socket.on('error', (err: unknown) => {
      this.lastError =
        (err instanceof Error ? err.message : String(err)) ?? 'UNKNOWN_ERROR';
      this.reconnectAttempts++;
      this.logger.error(
        `Socket error (attempt ${this.reconnectAttempts}): ${this.lastError}`,
      );
    });
    return socket;
  }

  async emit<TResponse = unknown>(
    event: HydrolineBeaconEvent,
    payload: Record<string, unknown>,
    options?: EmitOptions,
  ): Promise<TResponse> {
    const status = this.getConnectionStatus();
    if (!status.connected) {
      const err = new HttpException(
        `Beacon is not connected. Cannot execute event ${event}. Please verify the Beacon service and try again.`,
        503,
      );
      this.logger.warn(err.message);
      throw err;
    }
    const socket = this.ensureSocket();
    const body = {
      ...payload,
      key: this.options.key,
    };
    const timeoutMs = options?.timeoutMs ?? this.options.timeoutMs ?? 10000;
    return new Promise<TResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        const err = new Error(`${event} ack timeout after ${timeoutMs}ms`);
        this.logger.warn(`Request timeout: ${err.message} (event: ${event})`);
        reject(err);
      }, timeoutMs);

      socket.emit(event, body, (response: TResponse) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.connecting = false;
    }
  }

  forceReconnect() {
    this.disconnect();
    this.ensureSocket();
  }

  isConnected() {
    return Boolean(this.socket?.connected);
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected(),
      connecting: this.connecting,
      lastConnectedAt: this.lastConnectedAt?.toISOString() ?? null,
      lastError: this.lastError,
      reconnectAttempts: this.reconnectAttempts,
      endpoint: this.options.endpoint,
    };
  }
}
