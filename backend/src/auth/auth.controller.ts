import { Controller, Post, Body, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signUp(
    @Body() body: { email: string; password: string; name?: string },
  ) {
    const { email, password, name } = body;
    return this.authService.signUp(email, password, name);
  }

  @Post('signin')
  async signIn(@Body() body: { email: string; password: string }) {
    const { email, password } = body;
    return this.authService.signIn(email, password);
  }

  @Post('signout')
  async signOut(@Req() req: Request) {
    const authorization = req.headers.authorization;
    if (!authorization) {
      return { success: false, message: 'No authorization header' };
    }
    const token = authorization.replace('Bearer ', '');
    const success = await this.authService.signOut(token);
    return { success };
  }

  @Get('session')
  async getSession(@Req() req: Request) {
    const authorization = req.headers.authorization;
    if (!authorization) {
      return null;
    }
    const token = authorization.replace('Bearer ', '');
    return this.authService.getSession(token);
  }
}
