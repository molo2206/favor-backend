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
  ) { }

  async create(dto: CreateRoleUserDto): Promise<{ message: string; data: RoleUser }> {
    const role = this.roleUserRepository.create(dto);
    const savedRole = await this.roleUserRepository.save(role);

    return {
      message: 'Rôle utilisateur créé avec succès',
      data: savedRole,
    };
  }

  async update(id: string, dto: UpdateRoleUserDto): Promise<{ message: string; data: RoleUser }> {
    const role = await this.findOne(id);
    Object.assign(role, dto);
    const updatedRole = await this.roleUserRepository.save(role);

    return {
      message: 'Rôle utilisateur mis à jour avec succès',
      data: updatedRole,
    };
  }


  async findAll(): Promise<RoleUser[]> {
    return this.roleUserRepository.find();
  }

  async findOne(id: string): Promise<RoleUser> {
    const role = await this.roleUserRepository.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Rôle non trouvé');
    return role;
  }

  async remove(id: string): Promise<void> {
    const role = await this.findOne(id);
    await this.roleUserRepository.remove(role);
  }
}
