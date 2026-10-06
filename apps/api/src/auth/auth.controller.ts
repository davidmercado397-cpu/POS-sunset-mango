import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ENV, Env } from '../config/env';
import { AuthService, IssuedTokens } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

export const REFRESH_COOKIE = 'pos_rt';
const COOKIE_PATH = '/api/auth';
// Intentos de login por IP por minuto (configurable para pruebas).
const loginRateLimit = () => Number(process.env.LOGIN_RATE_LIMIT ?? 10);

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Throttle({ default: { limit: () => loginRateLimit(), ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.login(dto.username, dto.password, this.client(req));
    return this.sendTokens(res, tokens);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const tokens = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], this.client(req));
      return this.sendTokens(res, tokens);
    } catch (err) {
      this.clearCookie(res);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    this.clearCookie(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Post('change-password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    await this.auth.changePassword(user, dto.currentPassword, dto.newPassword);
    this.clearCookie(res);
  }

  private sendTokens(res: Response, tokens: IssuedTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.env.cookieSecure,
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires: tokens.refreshExpiresAt,
    });
    return { accessToken: tokens.accessToken };
  }

  private clearCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH, httpOnly: true, secure: this.env.cookieSecure, sameSite: 'strict' });
  }

  private client(req: Request) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }
}
