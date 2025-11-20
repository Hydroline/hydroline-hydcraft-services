import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { OptionalAuthGuard } from '../../auth/optional-auth.guard';
import { AuthGuard } from '../../auth/auth.guard';
import { OAuthFlowService } from '../services/oauth-flow.service';
import { StartOauthDto } from '../dto/start-oauth.dto';
import { buildRequestContext } from '../../auth/helpers/request-context.helper';

@ApiTags('OAuth')
@Controller('oauth/providers')
export class OAuthPublicController {
  constructor(private readonly flowService: OAuthFlowService) {}

  @Post(':providerKey/authorize')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Initiate OAuth flow' })
  async startAuthorize(
    @Param('providerKey') providerKey: string,
    @Body() dto: StartOauthDto,
    @Req() req: Request,
  ) {
    if (dto.mode === 'BIND' && !req.user?.id) {
      throw new BadRequestException('Binding requires authenticated user');
    }
    const result = await this.flowService.start(
      {
        providerKey,
        mode: dto.mode,
        redirectUri: dto.redirectUri,
        userId: dto.mode === 'BIND' ? req.user!.id : undefined,
        rememberMe: dto.rememberMe,
      },
      buildRequestContext(req),
    );
    return result;
  }

  @Get(':providerKey/callback')
  @ApiOperation({ summary: 'OAuth redirect callback' })
  async handleCallback(
    @Param('providerKey') providerKey: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      throw new BadRequestException('Missing authorization response');
    }
    const result = await this.flowService.handleCallback({
      providerKey,
      state,
      code,
      context: buildRequestContext(req),
    });
    const target = new URL(
      result.redirectUri ||
        process.env.APP_PUBLIC_BASE_URL ||
        'http://localhost:3100',
    );
    target.searchParams.set('provider', providerKey);
    target.searchParams.set('state', state);
    res.redirect(target.toString());
  }

  @Get(':providerKey/result')
  @ApiOperation({ summary: 'Fetch OAuth result by state' })
  async fetchResult(@Query('state') state: string) {
    if (!state) {
      throw new BadRequestException('state is required');
    }
    const payload = await this.flowService.consumeResult(state);
    if (!payload) {
      throw new BadRequestException('Result expired or missing');
    }
    return payload;
  }

  @Delete(':providerKey/bindings')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: '解除当前用户的 Provider 绑定' })
  async unlinkProvider(
    @Param('providerKey') providerKey: string,
    @Req() req: Request,
  ) {
    await this.flowService.unlink(providerKey, req.user!.id);
    return { success: true };
  }
}
