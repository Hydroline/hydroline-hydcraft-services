import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { LuckpermsService } from './luckperms.service';
import { LuckpermsCacheService } from '../cache/luckperms-cache.service';
import { ScheduledFetchService } from '../lib/sync/scheduled-fetch.service';

const LUCKPERMS_SYNC_FREQUENCY_MS = 30 * 60 * 1000;
const LUCKPERMS_SYNC_BATCH_SIZE = 200;

@Injectable()
export class LuckpermsCacheSyncService implements OnModuleInit {
  private readonly logger = new Logger(LuckpermsCacheSyncService.name);

  constructor(
    private readonly luckpermsService: LuckpermsService,
    private readonly cache: LuckpermsCacheService,
    private readonly scheduledFetch: ScheduledFetchService,
  ) {}

  onModuleInit() {
    this.scheduledFetch.registerTask({
      id: 'luckperms-cache',
      frequencyMs: LUCKPERMS_SYNC_FREQUENCY_MS,
      getLastSyncedAt: () => this.cache.getLastSyncedAt(),
      handler: async (context) => {
        this.logger.log(`Triggering LuckPerms cache sync (${context.reason})`);
        await this.sync();
      },
    });
  }

  private async sync() {
    this.logger.log('Starting LuckPerms cache synchronization');
    try {
      let offset = 0;
      while (true) {
        const players = await this.luckpermsService.listPlayers(
          offset,
          LUCKPERMS_SYNC_BATCH_SIZE,
        );
        if (!players.length) {
          break;
        }
        await this.cache.upsertPlayers(players);
        if (players.length < LUCKPERMS_SYNC_BATCH_SIZE) {
          break;
        }
        offset += LUCKPERMS_SYNC_BATCH_SIZE;
      }
    } catch (error) {
      this.logger.error('LuckPerms cache synchronization failed', error);
      throw error;
    }
    this.logger.log('LuckPerms cache synchronization completed');
  }
}
