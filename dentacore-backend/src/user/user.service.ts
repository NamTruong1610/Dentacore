import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePendingUserDto } from './dto/create-user.dto.js';

// Users are soft-deleted: deleteUser sets deletedAt instead of removing the row,
// so every read filters on deletedAt: null to hide deleted users.
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  // READ all
  findAllUsers() {
    return this.prisma.user.findMany({ where: { deletedAt: null } });
  }

  // READ one
  async findUsersById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  // CREATE
  async createPendingUser(createUserDto: CreatePendingUserDto) {
    return this.prisma.user.create({ data: createUserDto });
  }

  // UPDATE
  async updateUser(id: string, data: Prisma.UserUpdateInput) {
    await this.findUsersById(id); // throws 404 if the user doesn't exist
    return this.prisma.user.update({ where: { id }, data });
  }

  // DELETE (soft)
  async deleteUser(id: string) {
    await this.findUsersById(id); // throws 404 if the user doesn't exist
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
