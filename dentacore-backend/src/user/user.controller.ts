import { Controller, Get, Query, Param, Post, Body } from '@nestjs/common';
import { UserService } from './user.service.js'
import { CreatePendingUserDto } from './dto/create-user.dto.js'

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService
  ) {}
  @Get()
  getAllUsers() {
    return this.userService.findAllUsers();
  }

  @Get(':id')
  getUsersById(
    @Param('id') id: string
  ) {
    return this.userService.findUsersById(id);
  }

  @Post()
  createPendingUser(
    @Body() createUserDto: CreatePendingUserDto
  ) {
    return this.userService.createPendingUser(createUserDto);
  }
}
