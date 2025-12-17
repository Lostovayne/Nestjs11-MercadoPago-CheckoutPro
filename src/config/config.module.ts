import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        // Database
        DB_HOST: Joi.string().default('localhost'),
        DB_PORT: Joi.number().default(5432),
        DB_USER: Joi.string().required(),
        DB_PASSWORD: Joi.string().required(),
        DB_NAME: Joi.string().required(),

        // Mercado Pago
        MERCADOPAGO_ACCESS_TOKEN: Joi.string().required(),
        MERCADOPAGO_PUBLIC_KEY: Joi.string().optional(),
        MERCADOPAGO_WEBHOOK_SECRET: Joi.string().optional(),

        // Application
        PORT: Joi.number().default(3000),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),

        // Frontend URLs
        FRONTEND_URL: Joi.string().uri().required(),
        FRONTEND_SUCCESS_URL: Joi.string().uri().required(),
        FRONTEND_FAILURE_URL: Joi.string().uri().required(),
        FRONTEND_PENDING_URL: Joi.string().uri().required(),
      }),
    }),
  ],
})
export class ConfigModule {}
