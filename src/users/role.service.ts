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

  async update(id: string, dto: Partial<CreateRoleDto>) {
    const role = await this.findOne(id); // Vérifie si le rôle existe
    Object.assign(role, dto); // Merge les nouvelles valeurs
    return await this.roleRepo.save(role);
  }

  async changerStatus(id: string, dto: Partial<CreateRoleDto> & { status?: boolean }) {
    const role = await this.findOne(id); // Vérifie si le rôle existe
    // Si le front envoie status en string, on le convertit en boolean
    if (dto.status !== undefined) {
      dto.status = dto.status === true;
    }
    Object.assign(role, dto); // Merge les nouvelles valeurs
    return await this.roleRepo.save(role);
  }

  async delete(id: string) {
    const role = await this.findOne(id);
    return await this.roleRepo.remove(role);
  }
}
