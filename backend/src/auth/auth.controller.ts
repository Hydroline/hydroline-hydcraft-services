import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { UpdateCurrentUserDto } from './dto/update-current-user.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthGuard } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('signup')
  async signUp(@Body() dto: SignUpDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.signUp(dto);
    this.attachCookies(res, result.cookies);
    return {
      tokens: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
      user: result.user,
    };
  }

  @Post('signin')
  async signIn(@Body() dto: SignInDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.signIn(dto);
    this.attachCookies(res, result.cookies);
    return {
      tokens: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
      user: result.user,
    };
  }

  @Post('refresh')
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.refresh(dto);
    this.attachCookies(res, result.cookies);
    return {
      tokens: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
      user: result.user,
    };
  }

  @Post('signout')
  async signOut(@Req() req: Request) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Authorization header');
    }
    const token = authHeader.slice(7);
    return this.authService.signOut(token);
  }

  @Get('session')
  @UseGuards(AuthGuard)
  async getSession(@Req() req: Request) {
    return {
      user: req.user,
    };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getCurrentUser(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    const user = await this.usersService.getSessionUser(userId);
    return { user };
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  async updateCurrentUser(
    @Req() req: Request,
    @Body() dto: UpdateCurrentUserDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    const user = await this.usersService.updateCurrentUser(userId, dto);
    return { user };
  }

  private attachCookies(res: Response, cookies: string[]) {
    if (!cookies || cookies.length === 0) {
      return;
    }
    cookies.forEach((cookie) => {
      res.append('Set-Cookie', cookie);
    });
  }
}
