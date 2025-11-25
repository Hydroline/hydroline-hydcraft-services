import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './services/auth.service';
import { buildRequestContext } from './helpers/request-context.helper';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Missing Authorization header');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid Authorization header');
    }

    const token = authHeader.slice(7);
    const session = await this.authService.getSession(token);
    // Persist latest IP/User-Agent on every authenticated request
    try {
      const ctx = buildRequestContext(request);
      await this.authService.touchSession(session.sessionToken, ctx);
    } catch {
      // best-effort only
    }
    request.user = session.user;
    request.sessionToken = session.sessionToken;
    return true;
  }
}
