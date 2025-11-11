import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

type SendMailOptions = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private readonly fromAddress: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    const portRaw = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secureFlag = process.env.SMTP_SECURE;
    this.fromAddress = process.env.MAIL_FROM ?? 'no-reply@hydroline.local';

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
    await this.transporter.sendMail({
      from: this.fromAddress,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html ?? options.text,
    });
  }
}
