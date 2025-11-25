import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from './services/auth.service';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (
      !authHeader ||
      typeof authHeader !== 'string' ||
      !authHeader.startsWith('Bearer ')
    ) {
      return true;
    }

    const token = authHeader.slice(7);
    try {
      const session = await this.authService.getSession(token);
      request.user = session.user;
      request.sessionToken = session.sessionToken;
    } catch (error) {
      request.user = undefined;
      request.sessionToken = undefined;
    }
    return true;
  }
}
