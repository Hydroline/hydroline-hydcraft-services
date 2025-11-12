import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

type TemplateValue = string | number | boolean | null | undefined;

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

  constructor() {
    const host = process.env.SMTP_HOST;
    const portRaw = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secureFlag = process.env.SMTP_SECURE;
    this.fromAddress = process.env.MAIL_FROM ?? 'no-reply@hydroline.local';
    this.templateRoot = join(__dirname, 'templates');

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

  async sendMail(options: SendMailOptions) {
    if (!this.transporter) {
      throw new ServiceUnavailableException('邮件服务未配置');
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
}
