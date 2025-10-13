import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity } from './entities/roles.entity';
import { CreateRoleDto } from './dto/roles_plateforme_user/create-role.dto';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
  ) {}

  async create(dto: CreateRoleDto) {
    const role = this.roleRepo.create(dto);
    return await this.roleRepo.save(role);
  }

  async findAll() {
    return await this.roleRepo.find();
  }

  async findOne(id: string) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Rôle introuvable');
    return role;
  }

  async delete(id: string) {
    const role = await this.findOne(id);
    return await this.roleRepo.remove(role);
  }
}
