import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from '../auth/password.service.js';
import { SessionService } from '../auth/session.service.js';
import { OutboxService } from '../messaging/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoleService } from '../role/role.service.js';
import { EmployeeService } from './employee.service.js';

describe('EmployeeService', () => {
  let service: EmployeeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeService,
        // Stand-ins for the service's dependencies, so no database, email server, etc. is needed.
        { provide: PrismaService, useValue: {} },
        { provide: PasswordService, useValue: {} },
        { provide: SessionService, useValue: {} },
        { provide: RoleService, useValue: {} },
        { provide: OutboxService, useValue: {} },
        { provide: ConfigService, useValue: {} },
      ],
    }).compile();

    service = module.get<EmployeeService>(EmployeeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
