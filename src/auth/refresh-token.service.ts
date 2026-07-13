import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env.validation';

export interface IssuedRefreshToken {
  token: string; // the plaintext token (goes in the cookie)
  expiresAt: Date;
}

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);
  private readonly ttlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlDays = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateToken(): string {
    return randomBytes(48).toString('base64url');
  }

  async issue(userId: string, family?: string): Promise<IssuedRefreshToken> {
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId,
        family: family ?? randomBytes(16).toString('hex'),
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  async rotate(
    presentedToken: string,
  ): Promise<{ userId: string; issued: IssuedRefreshToken } | null> {
    const tokenHash = this.hashToken(presentedToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    // Not found, expired → invalid
    if (!existing || existing.expiresAt < new Date()) {
      return null;
    }

    // REUSE DETECTION: a revoked token was presented again → theft.
    if (existing.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for family ${existing.family} — revoking entire family`,
      );
      await this.prisma.refreshToken.updateMany({
        where: { family: existing.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return null;
    }

    // Valid: revoke the old, issue a new one in the same family
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    const issued = await this.issue(existing.userId, existing.family);
    return { userId: existing.userId, issued };
  }

  async revokeFamily(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (existing) {
      await this.prisma.refreshToken.updateMany({
        where: { family: existing.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }
}