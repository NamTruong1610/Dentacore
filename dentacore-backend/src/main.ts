import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import { parseOrigins } from './auth/origin-check.middleware.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser()); // fills req.cookies, where the session cookie is read from
  // Lets the frontend (a different origin in development) call the API with cookies.
  app.enableCors({
    origin: parseOrigins(process.env.FRONTEND_ORIGIN),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // only allow fields declared in the DTO...
      forbidNonWhitelisted: true, // ...and reject the request (400) if any others are sent
      transform: true, // turn the body/query into a DTO instance (applies defaults, converts types)
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
