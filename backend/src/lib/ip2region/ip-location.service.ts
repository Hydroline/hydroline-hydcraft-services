import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { existsSync, statSync } from 'node:fs';
import * as path from 'node:path';

export type IpLocationResult = {
  raw: string | null;
  country: string | null;
  region: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  isp: string | null;
  display: string | null;
};

@Injectable()
export class IpLocationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IpLocationService.name);
  private readonly dbPaths: { v4: string | null; v6: string | null };
  private readonly searchers = new Map<
    'v4' | 'v6',
    import('ip2region.js').Searcher
  >();
  private ip2regionModule: typeof import('ip2region.js') | null = null;
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private readonly missingDbLogged = new Set<'v4' | 'v6'>();

  constructor() {
    this.dbPaths = this.resolveDbPaths();
  }

  async onModuleInit() {
    await this.ensureInitialized();
  }

  onModuleDestroy() {
    for (const [version, searcher] of this.searchers) {
      try {
        searcher.close();
      } catch (error) {
        const message = `Failed to close ip2region ${version.toUpperCase()} searcher: ${this.formatError(error)}`;
        this.logger.debug(message);
      }
    }
    this.searchers.clear();
  }

  async lookup(
    ipAddress: string | null | undefined,
  ): Promise<IpLocationResult | null> {
    if (!ipAddress) {
      return null;
    }

    const value = ipAddress.trim();
    if (!value) {
      return null;
    }

    await this.ensureInitialized();
    if (!this.ip2regionModule) {
      return null;
    }

    try {
      const searcher = this.pickSearcher(value);
      if (!searcher) {
        return null;
      }
      const regionRaw = searcher.search(value) as unknown;
      const regionText = this.toRegionString(regionRaw);
      if (!regionText) {
        return null;
      }
      return this.parseRegion(regionText);
    } catch (error) {
      const message = `ip2region lookup failed for '${value}': ${this.formatError(error)}`;
      this.logger.debug(message);
      return null;
    }
  }

  private resolveDbPaths(): { v4: string | null; v6: string | null } {
    return {
      v4: this.resolveDbPath('v4'),
      v6: this.resolveDbPath('v6'),
    };
  }

  private async ensureInitialized() {
    if (this.initialized || this.searchers.size > 0) {
      return;
    }
    if (this.initializing) {
      await this.initializing;
      return;
    }
    this.initializing = this.initializeInternal();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async initializeInternal() {
    try {
      const module = await import('ip2region.js');
      this.ip2regionModule = module;
      const loadedVersions: string[] = [];
      for (const version of ['v4', 'v6'] as const) {
        const searcher = this.createSearcher(version, module);
        if (searcher) {
          this.searchers.set(version, searcher);
          loadedVersions.push(version.toUpperCase());
        }
      }

      if (loadedVersions.length === 0) {
        this.logger.warn(
          'ip2region database not loaded. IP geolocation lookup is disabled.',
        );
        return;
      }

      this.initialized = true;
      const message = `ip2region database loaded (${loadedVersions.join(', ')})`;
      this.logger.log(message);
    } catch (error) {
      const message = `Failed to initialise ip2region searcher: ${this.formatError(error)}`;
      this.logger.error(message);
    }
  }

  private createSearcher(
    version: 'v4' | 'v6',
    module: typeof import('ip2region.js'),
  ): import('ip2region.js').Searcher | null {
    const dbPath = this.dbPaths[version];
    if (!dbPath) {
      this.logMissingDb(version);
      return null;
    }

    try {
      const header = module.loadHeaderFromFile(dbPath);
      const detectedVersion = module.versionFromHeader(header);
      if (!detectedVersion) {
        const message = `Could not determine ip2region version for database ${dbPath}`;
        this.logger.warn(message);
        return null;
      }

      const expectedId = version === 'v4' ? module.IPv4.id : module.IPv6.id;
      if (detectedVersion.id !== expectedId) {
        const message = `ip2region database ${dbPath} reports version ${detectedVersion.name}, expected ${version.toUpperCase()}.`;
        this.logger.warn(message);
      }

      const buffer = module.loadContentFromFile(dbPath);
      return module.newWithBuffer(detectedVersion, buffer);
    } catch (error) {
      const message = `Failed to initialise ip2region ${version.toUpperCase()} searcher from ${dbPath}: ${this.formatError(error)}`;
      this.logger.error(message);
      return null;
    }
  }

  private pickSearcher(
    ipAddress: string,
  ): import('ip2region.js').Searcher | null {
    if (!this.ip2regionModule) {
      return null;
    }

    let version: 'v4' | 'v6' | null = null;
    try {
      const parsed = this.ip2regionModule.parseIP(ipAddress);
      version = parsed.length === 16 ? 'v6' : 'v4';
    } catch (error) {
      const message = `Failed to parse IP address '${ipAddress}': ${this.formatError(error)}`;
      this.logger.debug(message);
      return null;
    }

    const searcher = this.searchers.get(version);
    if (!searcher) {
      const message = `ip2region ${version.toUpperCase()} database not available for IP '${ipAddress}'.`;
      this.logger.debug(message);
      return null;
    }

    return searcher;
  }

  private parseRegion(regionText: string): IpLocationResult {
    const segments = regionText.split('|');
    while (segments.length < 5) {
      segments.push('');
    }
    const [countryRaw, regionRaw, provinceRaw, cityRaw, ispRaw] = segments;
    const country = this.normalizeSegment(countryRaw);
    const region = this.normalizeSegment(regionRaw);
    const province = this.normalizeSegment(provinceRaw);
    const city = this.normalizeSegment(cityRaw);
    const isp = this.normalizeSegment(ispRaw);

    // ip2region does not provide district separately, reuse region if it looks specific enough.
    const district = region && region !== province ? region : null;

    const locationPieces = [country, province, city].filter(Boolean);
    const base = locationPieces.join(' ');
    const display = base && isp ? `${base} · ${isp}` : base || isp || null;

    return {
      raw: regionText || null,
      country,
      region,
      province,
      city,
      district,
      isp,
      display,
    };
  }

  private toRegionString(input: unknown): string | null {
    // Common cases first
    if (typeof input === 'string') return input;

    // Buffer (Node.js)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyInput: any = input as any;
    if (anyInput && typeof anyInput === 'object') {
      // Node Buffer
      if (typeof (anyInput as Buffer).toString === 'function' && typeof (anyInput as Buffer).length === 'number' && Buffer.isBuffer(anyInput)) {
        return (anyInput as Buffer).toString('utf8');
      }

      // Uint8Array
      if (typeof (anyInput as Uint8Array).BYTES_PER_ELEMENT === 'number' && anyInput instanceof Uint8Array) {
        return Buffer.from(anyInput).toString('utf8');
      }

      // ArrayBuffer
      if (typeof (anyInput as ArrayBuffer).byteLength === 'number' && anyInput instanceof ArrayBuffer) {
        return Buffer.from(new Uint8Array(anyInput)).toString('utf8');
      }

      // Library may return object with region/text or structured fields
      if (typeof anyInput.region === 'string') return anyInput.region as string;
      if (typeof anyInput.text === 'string') return anyInput.text as string;

      const parts: string[] = [];
      if (typeof anyInput.country === 'string') parts.push(anyInput.country);
      if (typeof anyInput.region === 'string') parts.push(anyInput.region);
      if (typeof anyInput.province === 'string') parts.push(anyInput.province);
      if (typeof anyInput.city === 'string') parts.push(anyInput.city);
      if (typeof anyInput.isp === 'string') parts.push(anyInput.isp);
      if (parts.length) return parts.join('|');

      // Array-like of strings
      if (Array.isArray(anyInput)) {
        try {
          const text = (anyInput as unknown[])
            .map((v) => (typeof v === 'string' ? v : String(v ?? '')))
            .join('|');
          return text;
        } catch {
          // fallthrough
        }
      }
    }

    return null;
  }

  private normalizeSegment(segment: string | null | undefined): string | null {
    if (!segment) {
      return null;
    }
    const value = segment.trim();
    if (!value || value === '0') {
      return null;
    }
    return value;
  }

  private logMissingDb(version: 'v4' | 'v6') {
    if (this.missingDbLogged.has(version)) {
      return;
    }
    const label = version.toUpperCase();
    this.logger.warn(
      `ip2region ${label} database file not found. Set IP2REGION_${label}_DB_PATH or place the xdb file under data/ip2region/.`,
    );
    this.missingDbLogged.add(version);
  }

  private formatError(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private resolveDbPath(version: 'v4' | 'v6'): string | null {
    const envKey =
      version === 'v4' ? 'IP2REGION_V4_DB_PATH' : 'IP2REGION_V6_DB_PATH';
    const fileNames =
      version === 'v4'
        ? ['ip2region_v4.xdb', 'ip2region.xdb']
        : ['ip2region_v6.xdb'];
    const envSpecific = process.env[envKey] ?? null;
    const envGeneric = process.env.IP2REGION_DB_PATH ?? null;

    const candidates = new Set<string>();

    const addCandidate = (candidate: string | null | undefined) => {
      if (candidate) {
        candidates.add(candidate);
      }
    };

    addCandidate(envSpecific);
    if (envGeneric) {
      addCandidate(envGeneric);
      for (const name of fileNames) {
        addCandidate(path.join(envGeneric, name));
      }
    }

    const baseDirs = [
      process.cwd(),
      path.resolve(process.cwd(), 'data'),
      path.resolve(process.cwd(), 'data/ip2region'),
      path.resolve(__dirname, '../../../data'),
      path.resolve(__dirname, '../../../data/ip2region'),
    ];

    for (const dir of baseDirs) {
      for (const name of fileNames) {
        addCandidate(path.join(dir, name));
      }
    }

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      if (!existsSync(candidate)) {
        continue;
      }
      try {
        if (statSync(candidate).isFile()) {
          return candidate;
        }
      } catch (error) {
        const message = `Failed to inspect ip2region candidate ${candidate}: ${this.formatError(error)}`;
        this.logger.debug(message);
      }
    }

    return null;
  }
}
