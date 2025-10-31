import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

interface ApiErrorResponse {
  code: number;
  message: string;
  timestamp: number;
  data: Record<string, unknown>;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const { status, message, payload } = this.normalizeError(exception);
    const body: ApiErrorResponse = {
      code: status,
      message,
      timestamp: Math.floor(Date.now() / 1000),
      data: payload,
    };

    this.logger.error(
      `${request.method} ${request.url} -> ${status} ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json(body);
  }

  private normalizeError(exception: unknown) {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return { status, message: response, payload: {} };
      }
      if (typeof response === 'object' && response !== null) {
        const { message, ...rest } = response as Record<string, unknown>;
        return {
          status,
          message: Array.isArray(message) ? message.join('; ') : (message as string) ?? exception.message,
          payload: rest,
        };
      }
      return { status, message: exception.message, payload: {} };
    }

    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: exception.message,
        payload: { name: exception.name },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      payload: {},
    };
  }
}
