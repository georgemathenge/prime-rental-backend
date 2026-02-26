import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { PrismaService } from './prisma/prisma.service.js';
import { AuthService } from './auth/auth.service.js';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthController } from './auth/auth.controller.js';
import { JwtStrategy } from './auth/strategies/jwt.strategies.js';

import { ResendModule } from 'nest-resend';
import { MailService } from './services/mail/mail.service.js';
import { UserModule } from './user/user.module.js';
import { UploadModule } from './shared/upload/upload.module.js';
import { AdminModule } from './admin/admin.module.js';
import { House } from './house/entities/house.entity.js';
import { HouseModule } from './house/house.module.js';
import { TenantModule } from './tenant/tenant.module.js';
import { InvoiceModule } from './invoice/invoice.module.js';
import { PropertyModule } from './property/property.module.js';
import { ReportModule } from './report/report.module.js';
import { PaymentModule } from './payment/payment.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60, // seconds
          limit: 10, // requests
        },
      ],
    }),
    PrismaModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '7d' }, // Token expires in 7 days
    }),
    ResendModule.forRoot({
      apiKey: process.env.RESEND_API_KEY || 'your-resend-api-key-here',
    }),
    UserModule,
    UploadModule,
    AdminModule,
    HouseModule,
    TenantModule,
    InvoiceModule,
    PropertyModule,
    ReportModule,
    PaymentModule,
    UsersModule,
  ],
  controllers: [AppController, AuthController],
  providers: [
    AppService,
    PrismaService,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    AuthService,
    JwtStrategy,
    MailService,
  ],
})
export class AppModule {}
