import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { ALL_PERMISSIONS, type Permission } from '../../auth/permissions.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const PERMISSION_MESSAGE = `each permission must be one of: ${ALL_PERMISSIONS.join(', ')}`;

export class CreateRoleDto {
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_PERMISSIONS, { each: true, message: PERMISSION_MESSAGE })
  permissions: Permission[];
}

// Same fields, all optional. `permissions`, if sent, replaces the role's whole list.
export class UpdateRoleDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_PERMISSIONS, { each: true, message: PERMISSION_MESSAGE })
  permissions?: Permission[];
}

// Replaces the employee's roles with exactly these.
export class SetEmployeeRolesDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  roleIds: string[];
}
