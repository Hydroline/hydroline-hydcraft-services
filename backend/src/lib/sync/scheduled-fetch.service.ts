import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

export type ScheduledFetchReason = 'startup' | 'scheduled' | 'manual';

export interface ScheduledFetchContext {
  reason: ScheduledFetchReason;
  runAt: Date;
}

export interface ScheduledFetchTaskOptions {
  id: string;
  frequencyMs: number;
  handler: (context: ScheduledFetchContext) => Promise<void>;
  getLastSyncedAt?: () => Promise<Date | null>;
}

interface ScheduledFetchTaskRecord {
  options: ScheduledFetchTaskOptions;
  lastSuccessAt: Date | null;
  running: boolean;
}

@Injectable()
export class ScheduledFetchService
  implements OnModuleInit, OnModuleDestroy, OnApplicationBootstrap
{
  private readonly logger = new Logger(ScheduledFetchService.name);
  private tasks = new Map<string, ScheduledFetchTaskRecord>();
  private globalTimer?: NodeJS.Timeout;
  private periodicTimer?: NodeJS.Timeout;
  private isBootstrapped = false;

  onModuleInit() {
    // Scheduling is deferred to application bootstrap.
  }

  onApplicationBootstrap() {
    this.isBootstrapped = true;
    void this.runStartupChecks().catch((error) =>
      this.logger.error('Scheduled fetch startup checks failed', error),
    );
    this.scheduleNextTick();
  }

  onModuleDestroy() {
    if (this.globalTimer) {
      clearTimeout(this.globalTimer);
    }
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
    }
  }

  registerTask(options: ScheduledFetchTaskOptions) {
    if (this.tasks.has(options.id)) {
      throw new Error(`Scheduled task ${options.id} already registered`);
    }
    const record: ScheduledFetchTaskRecord = {
      options,
      lastSuccessAt: null,
      running: false,
    };
    this.tasks.set(options.id, record);
    if (this.isBootstrapped) {
      void this.evaluateStartupForTask(record);
    }
  }

  async triggerTask(id: string, reason: ScheduledFetchReason = 'manual') {
    const record = this.tasks.get(id);
    if (!record) {
      throw new Error(`Unknown scheduled task ${id}`);
    }
    await this.runTask(record, { reason, runAt: new Date() });
  }

  private async runStartupChecks() {
    for (const record of this.tasks.values()) {
      await this.evaluateStartupForTask(record);
    }
  }

  private async evaluateStartupForTask(record: ScheduledFetchTaskRecord) {
    const { options } = record;
    const now = new Date();
    if (options.getLastSyncedAt) {
      try {
        const last = await options.getLastSyncedAt();
        if (!last || now.getTime() - last.getTime() >= options.frequencyMs) {
          await this.runTask(record, { reason: 'startup', runAt: now });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to evaluate start-up sync for ${options.id}: ${error}`,
        );
      }
      return;
    }
    if (!record.lastSuccessAt) {
      await this.runTask(record, { reason: 'startup', runAt: now });
    }
  }

  private scheduleNextTick() {
    if (this.globalTimer || this.periodicTimer) {
      return;
    }
    const now = new Date();
    const next = this.computeNextHalfHour(now);
    const delay = Math.max(next.getTime() - now.getTime(), 0);
    this.globalTimer = setTimeout(() => {
      void this.runScheduledTasks();
      this.periodicTimer = setInterval(
        () => void this.runScheduledTasks(),
        30 * 60 * 1000,
      );
      this.globalTimer = undefined;
    }, delay);
  }

  private async runScheduledTasks() {
    await this.checkAndRunTasks('scheduled');
  }

  private async checkAndRunTasks(reason: ScheduledFetchReason) {
    const now = new Date();
    for (const record of this.tasks.values()) {
      if (this.shouldRun(record, now)) {
        await this.runTask(record, { reason, runAt: now });
      }
    }
  }

  private shouldRun(record: ScheduledFetchTaskRecord, now: Date) {
    if (record.running) {
      return false;
    }
    if (!record.lastSuccessAt) {
      return true;
    }
    return (
      now.getTime() - record.lastSuccessAt.getTime() >=
      record.options.frequencyMs
    );
  }

  private async runTask(
    record: ScheduledFetchTaskRecord,
    context: ScheduledFetchContext,
  ) {
    record.running = true;
    try {
      await record.options.handler(context);
      record.lastSuccessAt = context.runAt;
    } catch (error) {
      this.logger.error(
        `Scheduled task ${record.options.id} failed (${context.reason})`,
        error,
      );
    } finally {
      record.running = false;
    }
  }

  private computeNextHalfHour(reference: Date) {
    const next = new Date(reference);
    next.setSeconds(0, 0);
    const minute = next.getMinutes();
    if (minute < 30) {
      next.setMinutes(30);
    } else {
      next.setMinutes(0);
      next.setHours(next.getHours() + 1);
    }
    return next;
  }
}
