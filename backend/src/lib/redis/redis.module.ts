import { Module, Logger } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { RedisService } from './redis.service';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        const logger = new Logger('RedisModule');
        const redisEnabled = process.env.REDIS_ENABLED !== 'false';
        const ttl = parseInt(process.env.REDIS_TTL || '3600000', 10);

        // 如果 Redis 被禁用，使用内存缓存
        if (!redisEnabled) {
          logger.warn(
            'Redis is disabled. Using in-memory cache instead. This is not recommended for production.',
          );
          return {
            ttl,
            // 使用内存缓存作为降级方案
          };
        }

        try {
          const redisUrl = `redis://${process.env.REDIS_PASSWORD ? `:${process.env.REDIS_PASSWORD}@` : ''}${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}/${process.env.REDIS_DB || '0'}`;
          logger.log(
            `Connecting to Redis: ${redisUrl.replace(/:[^:]*@/, ':***@')}`,
          );

          const store = await redisStore({
            url: redisUrl,
            // 添加连接选项以便更好地处理连接错误
            socket: {
              reconnectStrategy: (retries) => {
                if (retries > 3) {
                  logger.error('Redis connection failed after 3 retries');
                  return new Error('Redis max retries reached');
                }
                return Math.min(retries * 50, 500);
              },
            },
          });

          logger.log('Redis connected successfully');
          return {
            store,
            ttl,
          };
        } catch (error) {
          logger.error(
            `Failed to connect to Redis: ${error instanceof Error ? error.message : String(error)}. Falling back to in-memory cache.`,
          );

          // 降级到内存缓存，允许应用继续启动
          return {
            ttl,
          };
        }
      },
    }),
  ],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
