import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleUser } from './entities/role_user.entity';
import { CreateRoleUserDto } from './dto/create-role_user.dto';
import { UpdateRoleUserDto } from './dto/update-role_user.dto';

@Injectable()
export class RoleUserService {
  constructor(
    @InjectRepository(RoleUser)
    private readonly roleUserRepository: Repository<RoleUser>,
  ) {}

  async create(dto: CreateRoleUserDto): Promise<RoleUser> {
    const role = this.roleUserRepository.create(dto);
    return this.roleUserRepository.save(role);
  }

  async findAll(): Promise<RoleUser[]> {
    return this.roleUserRepository.find();
  }

  async findOne(id: string): Promise<RoleUser> {
    const role = await this.roleUserRepository.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Rôle non trouvé');
    return role;
  }

  async update(id: string, dto: UpdateRoleUserDto): Promise<RoleUser> {
    const role = await this.findOne(id);
    Object.assign(role, dto);
    return this.roleUserRepository.save(role);
  }

  async remove(id: string): Promise<void> {
    const role = await this.findOne(id);
    await this.roleUserRepository.remove(role);
  }
}
