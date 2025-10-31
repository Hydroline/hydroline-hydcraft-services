import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { auth } from '../lib/auth';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService, DEFAULT_ROLES } from './roles.service';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { UsersService } from './users.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';

interface AuthResponse {
  token: string | null;
  user: {
    id: string;
    email: string;
    name: string | null | undefined;
    image: string | null | undefined;
  };
  refreshToken?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
  ) {}

  async initializeDefaults() {
    await this.rolesService.ensureDefaultRolesAndPermissions();
    await this.ensureDefaultAdmin();
  }

  async signUp(dto: SignUpDto) {
    const headers = new Headers();
    const result = await auth.api
      .signUpEmail({
        body: {
          email: dto.email,
          password: dto.password,
          name: dto.name ?? dto.email,
          rememberMe: dto.rememberMe ?? false,
        },
        headers,
        returnHeaders: true,
      })
      .catch((error: any) => {
        throw new BadRequestException(error?.message ?? 'Failed to sign up');
      });

    const payload = result.response as AuthResponse;
    if (!payload.user?.id) {
      throw new BadRequestException('Failed to create user');
    }

    await this.usersService.initializeUserRecords(payload.user.id, {
      displayName: dto.name ?? dto.email,
      minecraftId: dto.minecraftId,
      minecraftNick: dto.minecraftNick,
    });
    await this.assignDefaultRole(payload.user.id);

    const tokens = this.extractTokens(result);
    const fullUser = await this.usersService.getUserDetail(payload.user.id);

    return {
      tokens,
      user: fullUser,
      cookies: tokens.cookies,
    };
  }

  async signIn(dto: SignInDto) {
    const headers = new Headers();
    const result = await auth.api
      .signInEmail({
        body: {
          email: dto.email,
          password: dto.password,
          rememberMe: dto.rememberMe ?? false,
        },
        headers,
        returnHeaders: true,
      })
      .catch((error: any) => {
        throw new UnauthorizedException(error?.message ?? 'Invalid credentials');
      });

    const payload = result.response as AuthResponse;
    if (!payload.user?.id || !payload.token) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = this.extractTokens(result);
    const user = await this.usersService.getUserDetail(payload.user.id);

    return {
      tokens,
      user,
      cookies: tokens.cookies,
    };
  }

  async refresh(dto: RefreshTokenDto) {
    const session = await this.prisma.session.findUnique({
      where: { token: dto.refreshToken },
    });

    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    const newExpires = new Date(Date.now() + this.sessionTtlMs);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: newExpires },
    });

    const user = await this.usersService.getUserDetail(session.userId);
    const tokens = {
      accessToken: dto.refreshToken,
      refreshToken: dto.refreshToken,
      cookies: [] as string[],
    };

    return {
      tokens,
      user,
      cookies: tokens.cookies,
    };
  }

  async signOut(token: string) {
    await this.prisma.session.delete({ where: { token } }).catch(() => undefined);
    return { success: true };
  }

  async getSession(token: string) {
    const session = await this.prisma.session.findUnique({ where: { token } });

    if (!session || session.expiresAt.getTime() < Date.now()) {
      if (session) {
        await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      }
      throw new UnauthorizedException('Invalid session');
    }

    const user = await this.usersService.getUserDetail(session.userId);
    return { user, sessionToken: token };
  }

  private extractTokens(result: { headers: Headers; response: AuthResponse }) {
    const cookies = this.collectCookies(result.headers);
    const cookieMap = this.parseCookieMap(cookies);
    const sessionToken = result.response.token;
    const refreshToken =
      cookieMap.get('refresh_token') ??
      cookieMap.get('session_token') ??
      sessionToken ??
      null;

    return {
      accessToken: sessionToken,
      refreshToken,
      cookies,
    };
  }
  
  private collectCookies(headers: Headers) {
    const setCookie = headers.get('set-cookie');
    if (!setCookie) {
      return [];
    }
    return this.splitSetCookie(setCookie);
  }

  private parseCookieMap(cookies: string[]) {
    const map = new Map<string, string>();
    for (const cookie of cookies) {
      const [rawName, ...rest] = cookie.split('=');
      if (!rawName || rest.length === 0) {
        continue;
      }
      const name = rawName.trim().toLowerCase();
      const value = rest.join('=').split(';')[0];
      const normalizedKey = this.normalizeCookieKey(name);
      if (normalizedKey) {
        map.set(normalizedKey, value);
      }
    }
    return map;
  }

  private normalizeCookieKey(name: string) {
    if (name.endsWith('.session_token')) {
      return 'session_token';
    }
    if (name.endsWith('.session_data')) {
      return 'session_data';
    }
    if (name.endsWith('.refresh_token')) {
      return 'refresh_token';
    }
    if (name.endsWith('.dont_remember')) {
      return 'dont_remember';
    }
    return undefined;
  }

  private splitSetCookie(header: string) {
    const cookies: string[] = [];
    let current = '';
    let insideExpires = false;

    for (let i = 0; i < header.length; i += 1) {
      const char = header[i];
      if (char === ',') {
        if (!insideExpires) {
          cookies.push(current.trim());
          current = '';
          continue;
        }
      }

      current += char;

      if (!insideExpires && current.trim().toLowerCase().endsWith('expires=')) {
        insideExpires = true;
      }

      if (insideExpires && char === ';') {
        insideExpires = false;
      }
    }

    if (current.trim()) {
      cookies.push(current.trim());
    }

    return cookies.filter(Boolean);
  }

  private get sessionTtlMs() {
    const expiresIn = auth.options.session?.expiresIn ?? 60 * 60 * 24 * 7;
    return expiresIn * 1000;
  }

  private async ensureDefaultAdmin() {
    const adminEmail = 'admin@hydcraft.local';
    const admin = await this.prisma.user.findUnique({ where: { email: adminEmail } });
    if (admin) {
      return;
    }

    const headers = new Headers();
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123456';
    const result = await auth.api.signUpEmail({
      body: {
        email: adminEmail,
        password,
        name: 'Administrator',
        rememberMe: false,
      },
      headers,
      returnHeaders: true,
    });

    const payload = result.response as AuthResponse;
    if (!payload.user?.id) {
      throw new BadRequestException('Failed to bootstrap admin user');
    }

    await this.usersService.initializeUserRecords(payload.user.id, {
      displayName: 'Administrator',
    });
    await this.assignDefaultRole(payload.user.id, DEFAULT_ROLES.ADMIN);
  }

  private async assignDefaultRole(userId: string, roleKey: string = DEFAULT_ROLES.PLAYER) {
    const role = await this.prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) {
      return;
    }

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId,
        roleId: role.id,
      },
    });
  }
}
