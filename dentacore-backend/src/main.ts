import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
