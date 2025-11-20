import { setTimeout as delay } from 'node:timers/promises';
import {
  McsmApiResponse,
  McsmCommandResult,
  McsmInstanceDetail,
  McsmInstanceIdentity,
  McsmOutputLog,
  McsmOverview,
} from './types';

export interface McsmClientConfig extends McsmInstanceIdentity {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export class McsmClient {
  constructor(private readonly config: McsmClientConfig) {}

  async getInstanceDetail(): Promise<McsmInstanceDetail> {
    return this.request<McsmInstanceDetail>('/api/instance');
  }

  async sendCommand(command: string): Promise<McsmCommandResult> {
    return this.request<McsmCommandResult>('/api/protected_instance/command', {
      command,
    });
  }

  async startInstance(): Promise<McsmCommandResult> {
    return this.request<McsmCommandResult>('/api/protected_instance/open');
  }

  async stopInstance(): Promise<McsmCommandResult> {
    return this.request<McsmCommandResult>('/api/protected_instance/stop');
  }

  async restartInstance(): Promise<McsmCommandResult> {
    return this.request<McsmCommandResult>('/api/protected_instance/restart');
  }

  async killInstance(): Promise<McsmCommandResult> {
    return this.request<McsmCommandResult>('/api/protected_instance/kill');
  }

  async getOutputLog(size?: number): Promise<McsmOutputLog> {
    const data = await this.request<string>(
      '/api/protected_instance/outputlog',
      size ? { size } : undefined,
    );
    return { output: data };
  }

  async getOverview(): Promise<McsmOverview> {
    return this.request<McsmOverview>('/api/overview', undefined, false);
  }

  private async request<T>(
    path: string,
    extraQuery?: Record<string, string | number | undefined>,
    includeInstanceIds = true,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = this.config.timeoutMs ?? 10000;
    const abortTimer = delay(timeout, null, {
      signal: controller.signal,
    }).catch(() => null);

    try {
      const url = new URL(path, this.config.baseUrl);
      const query: Record<string, string | number | undefined> = {
        ...extraQuery,
        apikey: this.config.apiKey,
      };
      if (includeInstanceIds) {
        query.uuid = this.config.uuid;
        query.daemonId = this.config.daemonId;
      }
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v));
        }
      });

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} while calling MCSM`);
      }
      const payload = (await response.json()) as McsmApiResponse<T>;
      if (payload.status !== 200) {
        throw new Error(
          `MCSM responded with status ${payload.status}${
            payload.message ? `: ${payload.message}` : ''
          }`,
        );
      }
      return payload.data;
    } finally {
      controller.abort();
      await abortTimer;
    }
  }
}
