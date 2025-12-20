import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AuthmeService } from './authme.service';
import { AuthmeCacheService } from '../cache/authme-cache.service';
import { ScheduledFetchService } from '../lib/sync/scheduled-fetch.service';

const AUTHME_SYNC_FREQUENCY_MS = 30 * 60 * 1000;
const AUTHME_SYNC_PAGE_SIZE = 100;

@Injectable()
export class AuthmeCacheSyncService implements OnModuleInit {
  private readonly logger = new Logger(AuthmeCacheSyncService.name);

  constructor(
    private readonly authmeService: AuthmeService,
    private readonly cache: AuthmeCacheService,
    private readonly scheduledFetch: ScheduledFetchService,
  ) {}

  onModuleInit() {
    this.scheduledFetch.registerTask({
      id: 'authme-cache',
      frequencyMs: AUTHME_SYNC_FREQUENCY_MS,
      getLastSyncedAt: () => this.cache.getLastSyncedAt(),
      handler: async (context) => {
        this.logger.log(`Triggering AuthMe cache sync (${context.reason})`);
        await this.sync();
      },
    });
  }

  private async sync() {
    this.logger.log('Starting AuthMe cache synchronization');
    let page = 1;
    try {
      while (true) {
        const response = await this.authmeService.listPlayers({
          page,
          pageSize: AUTHME_SYNC_PAGE_SIZE,
          sortField: 'username',
          sortOrder: 'asc',
        });
        await this.cache.upsertAccounts(response.items);
        if (response.items.length < AUTHME_SYNC_PAGE_SIZE) {
          break;
        }
        page += 1;
      }
    } catch (error) {
      this.logger.error('AuthMe cache synchronization failed', error);
      throw error;
    }
    this.logger.log('AuthMe cache synchronization completed');
  }
}
