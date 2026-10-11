import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmployeeActivatedConsumer } from './employee-activated.consumer.js';
import { NotificationStream } from './notification-stream.js';
import { NotificationController } from './notification.controller.js';
import { NotificationService } from './notification.service.js';

// In-app notifications: the list, the live stream, and the events that create them.
@Module({
  imports: [AuthModule], // SessionService, to close streams when the session ends
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationStream,
    EmployeeActivatedConsumer,
  ],
})
export class NotificationModule {}
