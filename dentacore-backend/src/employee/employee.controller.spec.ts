import { Test, TestingModule } from '@nestjs/testing';
import { EmployeeController } from './employee.controller.js';
import { EmployeeService } from './employee.service.js';

describe('EmployeeController', () => {
  let controller: EmployeeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployeeController],
      // Stand-in for the controller's dependency, so no real service (or database) is needed.
      providers: [{ provide: EmployeeService, useValue: {} }],
    }).compile();

    controller = module.get<EmployeeController>(EmployeeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
