import { Controller, Get, Query } from '@nestjs/common';
import { UserService } from './user.service.js'

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService
  ) {}
  @Get()
  getAllUsers() {
    return [];
  }
}
