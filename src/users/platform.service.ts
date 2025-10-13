import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformEntity } from './entities/plateforms.entity';
import { CreatePlatformDto } from './dto/roles_plateforme_user/create-platform.dto';

@Injectable()
export class PlatformService {
  constructor(
    @InjectRepository(PlatformEntity)
    private readonly platformRepo: Repository<PlatformEntity>,
  ) {}

  async create(dto: CreatePlatformDto) {
    const platform = this.platformRepo.create(dto);
    return await this.platformRepo.save(platform);
  }

  async update(id: string, dto: Partial<CreatePlatformDto>) {
    const platform = await this.findOne(id);
    Object.assign(platform, dto);
    return this.platformRepo.save(platform);
  }
  async findAll() {
    return await this.platformRepo.find();
  }

  async findOne(id: string) {
    const platform = await this.platformRepo.findOne({ where: { id } });
    if (!platform) throw new NotFoundException('Plateforme introuvable');
    return platform;
  }

  async changeStatus(id: string, dto: Partial<CreatePlatformDto> & { status?: boolean }) {
    const platform = await this.findOne(id);
    if (dto.status !== undefined) {
      dto.status = dto.status === true;
    }
    Object.assign(platform, dto);
    return await this.platformRepo.save(platform);
  }

  async delete(id: string) {
    const platform = await this.findOne(id);
    return await this.platformRepo.remove(platform);
  }
}
