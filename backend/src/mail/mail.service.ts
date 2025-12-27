import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { existsSync } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

type TemplateValue = string | number | boolean | null | undefined;

type TemplateManifestEntry = {
  key: string;
  label?: string;
  description?: string;
  filename?: string;
  defaultSubject?: string;
};

export type MailTemplateDefinition = {
  key: string;
  label: string;
  filename: string;
  description?: string;
  defaultSubject?: string;
};

type SendMailOptions = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  template?: string;
  context?: Record<string, TemplateValue>;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private readonly fromAddress: string;
  private readonly templateCache = new Map<string, string>();
  private readonly templateRoot: string;
  private templateManifestLoaded = false;
  private templateManifest: TemplateManifestEntry[] = [];

  constructor() {
    const host = process.env.SMTP_HOST;
    const portRaw = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secureFlag = process.env.SMTP_SECURE;
    this.fromAddress = process.env.MAIL_FROM ?? 'no-reply@hydroline.local';
    this.templateRoot = this.resolveTemplateRoot();

    if (!host || !portRaw || !user || !pass) {
      this.logger.warn(
        'SMTP 配置缺失（需要 SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS），邮件发送功能将不可用。',
      );
      return;
    }

    const port = Number(portRaw);
    if (!Number.isFinite(port)) {
      this.logger.warn(
        `SMTP_PORT 配置无效：${portRaw}，邮件发送功能将不可用。`,
      );
      return;
    }

    const secure = secureFlag ? secureFlag === 'true' : port === 465;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  private resolveTemplateRoot() {
    const candidates = [
      join(__dirname, 'templates'),
      join(__dirname, '..', '..', 'mail', 'templates'),
      join(process.cwd(), 'src', 'mail', 'templates'),
      join(process.cwd(), 'dist', 'mail', 'templates'),
    ];
    return candidates.find((dir) => existsSync(dir)) ?? candidates[0];
  }

  async sendMail(options: SendMailOptions) {
    if (!this.transporter) {
      throw new ServiceUnavailableException('Mail service is not configured');
    }

    let html = options.html;
    if (!html && options.template) {
      try {
        html = await this.renderTemplate(
          options.template,
          options.context ?? {},
        );
      } catch (error) {
        this.logger.error(
          `渲染邮件模板失败: ${options.template} - ${String(error)}`,
        );
        html = undefined;
      }
    }

    const text = options.text ?? (html ? this.stripHtml(html) : undefined);

    const resolvedHtml = html ?? text;
    const message = {
      from: this.fromAddress,
      to: options.to,
      subject: options.subject,
      text: text ?? '',
      ...(resolvedHtml ? { html: resolvedHtml } : {}),
    } satisfies SMTPTransport.Options;

    await this.transporter.sendMail(message);
  }

  async listTemplates(): Promise<MailTemplateDefinition[]> {
    try {
      const [manifestEntries, dirEntries] = await Promise.all([
        this.loadTemplateManifest(),
        readdir(this.templateRoot, { withFileTypes: true }),
      ]);
      const manifestByFilename = new Map(
        manifestEntries.map((entry) => [
          (entry.filename ?? `${entry.key}.html`).toLowerCase(),
          entry,
        ]),
      );
      const manifestByKey = new Map(
        manifestEntries.map((entry) => [entry.key, entry]),
      );
      const templates: MailTemplateDefinition[] = [];
      for (const file of dirEntries) {
        if (!file.isFile() || !file.name.endsWith('.html')) continue;
        const key = file.name.replace(/\.html$/, '');
        const manifestEntry =
          manifestByFilename.get(file.name.toLowerCase()) ??
          manifestByKey.get(key);
        const label = manifestEntry?.label ?? this.formatTemplateLabel(key);
        templates.push({
          key,
          filename: file.name,
          label,
          description: manifestEntry?.description,
          defaultSubject: manifestEntry?.defaultSubject,
        });
      }
      return templates.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
    } catch (error) {
      this.logger.error(`列出邮件模板失败: ${String(error)}`);
      return [];
    }
  }

  private async renderTemplate(
    name: string,
    context: Record<string, TemplateValue>,
  ) {
    const cacheKey = `${name}.html`;
    let template = this.templateCache.get(cacheKey);
    if (!template) {
      const filePath = join(this.templateRoot, cacheKey);
      template = await readFile(filePath, 'utf8');
      this.templateCache.set(cacheKey, template);
    }
    return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => {
      const value = context[key];
      if (value === undefined || value === null) {
        return '';
      }
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      return String(value);
    });
  }

  private stripHtml(content: string) {
    return content
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async loadTemplateManifest() {
    if (this.templateManifestLoaded) {
      return this.templateManifest;
    }
    this.templateManifestLoaded = true;
    try {
      const manifestPath = join(this.templateRoot, 'manifest.json');
      const content = await readFile(manifestPath, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        this.templateManifest = parsed
          .filter((entry): entry is TemplateManifestEntry =>
            Boolean(entry && typeof entry.key === 'string'),
          )
          .map((entry) => ({
            key: entry.key,
            label: entry.label,
            description: entry.description,
            filename: entry.filename,
            defaultSubject: entry.defaultSubject ?? entry['subject'],
          }));
      } else {
        this.templateManifest = [];
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`读取邮件模板 manifest 失败: ${String(error)}`);
      }
      this.templateManifest = [];
    }
    return this.templateManifest;
  }

  private formatTemplateLabel(key: string) {
    return key
      .split(/[-_\s]+/g)
      .filter(Boolean)
      .map(
        (segment) =>
          segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
      )
      .join(' ');
  }
}
