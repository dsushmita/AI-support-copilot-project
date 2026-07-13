import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response, CookieOptions } from 'express';
import { AuthService } from './auth.service';
import type { SafeUser, LoginResult } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';
import { TokenService } from './token.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

const REFRESH_COOKIE = 'refresh_token';

function refreshCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/auth',
    expires: expiresAt,
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<SafeUser> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult> {
    const result = await this.authService.login(dto);
    const refresh = await this.refreshTokenService.issue(result.user.id);
    res.cookie(
      REFRESH_COOKIE,
      refresh.token,
      refreshCookieOptions(refresh.expiresAt),
    );
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const presented = (req.cookies as Record<string, string>)[REFRESH_COOKIE];
    if (!presented) {
      throw new UnauthorizedException('No refresh token');
    }

    const rotated = await this.refreshTokenService.rotate(presented);
    if (!rotated) {
      res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    res.cookie(
      REFRESH_COOKIE,
      rotated.issued.token,
      refreshCookieOptions(rotated.issued.expiresAt),
    );

    const accessToken = await this.tokenService.signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
    });
    return { accessToken };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}