import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

type ApiResponse<T = unknown> = {
  code: number;
  message: string;
  timestamp: number;
  data: T;
};

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        if (this.isStandardResponse(data)) {
          return data;
        }

        const payload = data ?? {};
        return {
          code: 0,
          message: 'ok',
          timestamp: this.timestamp,
          data: payload,
        } satisfies ApiResponse;
      }),
    );
  }

  private get timestamp() {
    return Math.floor(Date.now() / 1000);
  }

  private isStandardResponse(data: unknown): data is ApiResponse {
    if (!data || typeof data !== 'object') {
      return false;
    }
    return (
      'code' in data &&
      'message' in data &&
      'timestamp' in data &&
      'data' in data
    );
  }
}
