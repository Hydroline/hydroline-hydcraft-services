#!/usr/bin/env ts-node
import 'dotenv/config';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PortalConfigService } from '../src/portal-config/portal-config.service';
import { AttachmentsService } from '../src/attachments/attachments.service';
import { DEFAULT_PORTAL_HOME_CONFIG } from '../src/portal-config/portal-config.constants';
import type { PortalHomeConfig } from '../src/portal-config/portal-config.types';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  const logger = new Logger('PortalHomeSeed');

  try {
    const portalConfigService = app.get(PortalConfigService);
    const attachmentsService = app.get(AttachmentsService);

    const config = await portalConfigService.getRawConfig();
    let mutated = false;

    if (!config.hero.subtitle) {
      config.hero.subtitle = DEFAULT_PORTAL_HOME_CONFIG.hero.subtitle;
      mutated = true;
      logger.log('Set default hero subtitle');
    }

    if (!config.cards) {
      config.cards = { ...DEFAULT_PORTAL_HOME_CONFIG.cards };
      mutated = true;
    } else {
      for (const [cardId, defaults] of Object.entries(
        DEFAULT_PORTAL_HOME_CONFIG.cards,
      )) {
        if (!config.cards[cardId]) {
          config.cards[cardId] = { ...defaults };
          mutated = true;
          logger.log(`Added default card visibility for "${cardId}"`);
        }
      }
    }

    if (config.hero.backgrounds.length === 0) {
      const backendRoot = join(__dirname, '..');
      const assetPath = join(
        backendRoot,
        '..',
        'frontend',
        'src',
        'assets',
        'images',
        'image_home_background_240730.webp',
      );
      try {
        const attachment = await attachmentsService.ensureSeededAttachment({
          seedKey: 'hero.home.240730',
          filePath: assetPath,
          fileName: 'image_home_background_240730.webp',
          folderPath: ['Public', 'Landing'],
          tagKeys: ['hero.home'],
          isPublic: true,
          description: '欧文',
        });
        if (attachment) {
          const rawDescription = (
            attachment.metadata as Record<string, unknown> | undefined
          )?.description;
          const description =
            typeof rawDescription === 'string' &&
            rawDescription.trim().length > 0
              ? rawDescription
              : 'Hydroline 城景';

          config.hero.backgrounds = [
            {
              id: randomUUID(),
              attachmentId: attachment.id,
              description,
            },
          ];
          mutated = true;
          logger.log('Seeded default hero background using attachments system');
        }
      } catch (error) {
        logger.warn(`Failed to seed hero background: ${String(error)}`);
      }
    }

    if (!mutated) {
      logger.log(
        'Portal home configuration already present, no changes applied.',
      );
      return;
    }

    await portalConfigService.overwriteConfig(config as PortalHomeConfig);
    logger.log('Portal home configuration seed complete.');
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
