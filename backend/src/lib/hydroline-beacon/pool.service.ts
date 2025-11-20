import { Injectable, Logger } from '@nestjs/common';
import { HydrolineBeaconClient } from './beacon.client';

interface BeaconPoolEntry {
  client: HydrolineBeaconClient;
  serverId: string;
  endpoint: string;
  key: string;
  timeoutMs?: number;
  maxRetry?: number;
  attempts: number;
  retryTimer?: NodeJS.Timeout | null;
  lastAttemptAt?: number;
}

@Injectable()
export class HydrolineBeaconPoolService {
  private readonly logger = new Logger('BeaconPool');
  private readonly pool = new Map<string, BeaconPoolEntry>();
  private readonly healthTimer: NodeJS.Timeout;

  constructor() {
    this.healthTimer = setInterval(() => this.healthCheck(), 15000);
  }

  private healthCheck() {
    for (const entry of this.pool.values()) {
      const status = entry.client.getConnectionStatus();

      if (!status.connected && !status.connecting && !entry.retryTimer) {
        this.logger.debug(
          `Health check: scheduling reconnection for ${entry.serverId}`,
        );
        this.scheduleNextAttempt(entry);
      }
    }
  }

  private computeDelayMsForAttempt(n: number): number {
    if (n <= 1) return 5000; // 5s
    if (n === 2) return 10000; // 10s
    if (n === 3) return 30000; // 30s
    return 60000; // 第4次及之后保持 60s
  }

  private scheduleNextAttempt(entry: BeaconPoolEntry) {
    if (entry.attempts >= (entry.maxRetry ?? 10)) {
      this.logger.warn(
        `Max retry attempts (${entry.maxRetry ?? 10}) reached for ${entry.serverId}, stopping reconnection`,
      );
      return;
    }

    const nextAttemptIndex = entry.attempts + 1;
    const delay = this.computeDelayMsForAttempt(nextAttemptIndex);
    this.logger.log(
      `Scheduling reconnection attempt ${nextAttemptIndex}/${entry.maxRetry ?? 10} for ${entry.serverId} in ${delay}ms`,
    );

    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = null;

      const status = entry.client.getConnectionStatus();
      if (status.connected) return;

      entry.attempts = nextAttemptIndex;
      entry.lastAttemptAt = Date.now();
      this.logger.debug(
        `Attempting reconnection (${nextAttemptIndex}/10) for ${entry.serverId} to ${entry.endpoint}`,
      );
      entry.client.forceReconnect();
      this.scheduleNextAttempt(entry);
    }, delay);
  }

  getOrCreate(opts: {
    serverId: string;
    endpoint: string;
    key: string;
    timeoutMs?: number;
    maxRetry?: number;
  }): HydrolineBeaconClient {
    const existing = this.pool.get(opts.serverId);
    if (existing) {
      const currentStatus = existing.client.getConnectionStatus();

      if (existing.endpoint !== opts.endpoint || existing.key !== opts.key) {
        this.logger.log(
          `Config changed for ${opts.serverId}, forcing reconnection`,
        );
        existing.client.forceReconnect();
        this.pool.delete(opts.serverId);
      } else {
        existing.client['forceReconnect'];
        existing.client['ensureSocket'];
        return existing.client;
      }
    }

    this.logger.log(
      `Creating new beacon connection for ${opts.serverId} to ${opts.endpoint}`,
    );

    const client = new HydrolineBeaconClient({
      endpoint: opts.endpoint,
      key: opts.key,
      timeoutMs: opts.timeoutMs,
      maxRetry: opts.maxRetry,
    });

    client.forceReconnect();
    this.pool.set(opts.serverId, {
      client,
      serverId: opts.serverId,
      endpoint: opts.endpoint,
      key: opts.key,
      timeoutMs: opts.timeoutMs,
      maxRetry: opts.maxRetry,
      attempts: 0,
      retryTimer: null,
    });

    const entry = this.pool.get(opts.serverId)!;
    this.scheduleNextAttempt(entry);

    return client;
  }

  getStatus(serverId: string) {
    const entry = this.pool.get(serverId);
    if (!entry) return null;
    return entry.client.getConnectionStatus();
  }

  getClientOrNull(serverId: string): HydrolineBeaconClient | null {
    const entry = this.pool.get(serverId);
    return entry?.client ?? null;
  }

  remove(serverId: string) {
    const entry = this.pool.get(serverId);

    if (entry) {
      if (entry.retryTimer) {
        clearTimeout(entry.retryTimer);
        entry.retryTimer = null;
      }
      entry.client.disconnect();
      this.pool.delete(serverId);
    }
  }

  listStatuses() {
    const result: Record<
      string,
      ReturnType<HydrolineBeaconClient['getConnectionStatus']>
    > = {};

    for (const [id, entry] of this.pool.entries()) {
      result[id] = entry.client.getConnectionStatus();
    }
    return result;
  }

  shutdown() {
    clearInterval(this.healthTimer);

    for (const entry of this.pool.values()) {
      if (entry.retryTimer) clearTimeout(entry.retryTimer);
      entry.client.disconnect();
    }

    this.pool.clear();
  }

  connect(serverId: string) {
    const entry = this.pool.get(serverId);

    if (!entry) throw new Error('Beacon entry not found');
    if (entry.retryTimer) {
      clearTimeout(entry.retryTimer);
      entry.retryTimer = null;
    }

    entry.attempts = 0;
    entry.client.forceReconnect();
    this.scheduleNextAttempt(entry);

    return entry.client.getConnectionStatus();
  }

  reconnect(serverId: string) {
    const entry = this.pool.get(serverId);

    if (!entry) throw new Error('Beacon entry not found');
    if (entry.retryTimer) {
      clearTimeout(entry.retryTimer);
      entry.retryTimer = null;
    }

    entry.attempts = 0;
    entry.client.forceReconnect();
    this.scheduleNextAttempt(entry);

    return entry.client.getConnectionStatus();
  }

  disconnect(serverId: string) {
    const entry = this.pool.get(serverId);

    if (!entry) throw new Error('Beacon entry not found');
    if (entry.retryTimer) {
      clearTimeout(entry.retryTimer);
      entry.retryTimer = null;
    }

    entry.attempts = 0;
    entry.client.disconnect();
    return entry.client.getConnectionStatus();
  }
}
