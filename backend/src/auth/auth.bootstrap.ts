import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthBootstrap implements OnModuleInit {
  constructor(private readonly authService: AuthService) {}

  async onModuleInit() {
    await this.authService.initializeDefaults();
  }
}
