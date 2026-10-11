import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';
import { RequirePermissions } from '../auth/auth-context.js';
import { DeadLetterService } from './dead-letter.service.js';

class RetryDeadLettersDto {
  /** Omit to re-send every dead message. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  messageIds?: string[];
}

class DiscardDeadLettersDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  messageIds: string[];
}

// Failed background messages (see DeadLetterService). The RabbitMQ UI shows the same queues.
@Controller('dead-letters')
@RequirePermissions('dead-letter:manage')
export class DeadLetterController {
  constructor(private readonly deadLetters: DeadLetterService) {}

  // GET /dead-letters
  @Get()
  list() {
    return this.deadLetters.list();
  }

  // POST /dead-letters/retry { messageIds? } — send again
  @Post('retry')
  @HttpCode(HttpStatus.OK)
  async retry(@Body() { messageIds }: RetryDeadLettersDto) {
    const { count } = await this.deadLetters.retry(messageIds);
    return { retried: count };
  }

  // POST /dead-letters/discard { messageIds } — delete for good
  @Post('discard')
  @HttpCode(HttpStatus.OK)
  async discard(@Body() { messageIds }: DiscardDeadLettersDto) {
    const { count } = await this.deadLetters.discard(messageIds);
    return { discarded: count };
  }
}
