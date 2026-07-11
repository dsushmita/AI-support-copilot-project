import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import type { RegisterDto } from './dto/register.dto';

export interface SafeUser {
  id: string;
  email: string;
  name: string | null;
  tenantId: string;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async register(dto: RegisterDto): Promise<SafeUser> {
    const passwordHash = await this.passwordService.hash(dto.password);
    const slug = this.slugify(dto.tenantName);

    try {
      const tenant = await this.prisma.tenant.create({
        data: {
          name: dto.tenantName,
          slug,
          users: {
            create: {
              email: dto.email.toLowerCase(),
              passwordHash,
            },
          },
        },
        include: { users: true },
      });

      const user = tenant.users[0];
      this.logger.log(`Registered user ${user.id} in tenant ${tenant.id}`);

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        createdAt: user.createdAt,
      };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'That email or organization already exists',
        );
      }
      throw error;
    }
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
  }
}
