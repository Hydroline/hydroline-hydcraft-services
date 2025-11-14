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
      // searcher.search is async in the JS implementation; TypeScript typings declare string.
      // Using Promise.resolve to support both forms safely.
      const regionRaw = await Promise.resolve(
        searcher.search(value as unknown as string),
      );
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
    const parts = regionText.split('|').map((s) => (s ?? '').trim());
    // ip2region variants may return 4 or 5 pipe-separated fields depending on DB/version
    let country: string | null = null;
    let region: string | null = null;
    let province: string | null = null;
    let city: string | null = null;
    let isp: string | null = null;

    if (parts.length >= 5) {
      // country | region | province | city | isp
      country = this.normalizeSegment(parts[0]);
      region = this.normalizeSegment(parts[1]);
      province = this.normalizeSegment(parts[2]);
      city = this.normalizeSegment(parts[3]);
      isp = this.normalizeSegment(parts[4]);
    } else if (parts.length === 4) {
      // country | province | city | isp
      country = this.normalizeSegment(parts[0]);
      province = this.normalizeSegment(parts[1]);
      city = this.normalizeSegment(parts[2]);
      isp = this.normalizeSegment(parts[3]);
      region = null;
    } else if (parts.length === 3) {
      // country | province | city
      country = this.normalizeSegment(parts[0]);
      province = this.normalizeSegment(parts[1]);
      city = this.normalizeSegment(parts[2]);
      region = null;
      isp = null;
    } else if (parts.length === 2) {
      // country | isp  (rare)
      country = this.normalizeSegment(parts[0]);
      isp = this.normalizeSegment(parts[1]);
    } else if (parts.length === 1) {
      // single token, could be '内网IP' etc
      const token = this.normalizeSegment(parts[0]);
      // treat as ISP-like label when no structured info
      isp = token;
    }

    // ip2region does not provide district separately, reuse region if it looks specific enough.
    const district = region && region !== province ? region : null;

    const locationPieces = [country, province, city].filter(Boolean);
    const base = locationPieces.join(' ');
    const display = base && isp ? `${base} ${isp}` : base || isp || null;

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

    // Array-like of strings
    if (Array.isArray(input)) {
      try {
        return input
          .map((v) => (typeof v === 'string' ? v : String(v ?? '')))
          .join('|');
      } catch {
        // ignore
      }
    }

    // Node Buffer
    if (this.isBuffer(input)) {
      return input.toString('utf8');
    }

    // Typed arrays
    if (this.isUint8Array(input)) {
      return Buffer.from(input).toString('utf8');
    }
    if (this.isArrayBuffer(input)) {
      return Buffer.from(new Uint8Array(input)).toString('utf8');
    }

    // Object with possible fields
    if (this.isRecord(input)) {
      const obj = input;
      if (typeof obj.region === 'string') return obj.region;
      if (typeof obj.text === 'string') return obj.text;

      const parts: string[] = [];
      if (typeof obj.country === 'string') parts.push(obj.country);
      if (typeof obj.region === 'string') parts.push(obj.region);
      if (typeof obj.province === 'string') parts.push(obj.province);
      if (typeof obj.city === 'string') parts.push(obj.city);
      if (typeof obj.isp === 'string') parts.push(obj.isp);
      if (parts.length) return parts.join('|');
    }

    return null;
  }

  private isBuffer(v: unknown): v is Buffer {
    return typeof Buffer !== 'undefined' && Buffer.isBuffer(v);
  }

  private isUint8Array(v: unknown): v is Uint8Array {
    return v instanceof Uint8Array;
  }

  private isArrayBuffer(v: unknown): v is ArrayBuffer {
    return v instanceof ArrayBuffer;
  }

  private isRecord(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
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
      path.resolve(__dirname, '../../data'),
      path.resolve(__dirname, '../../data/ip2region'),
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
