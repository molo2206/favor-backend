import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchEntity } from './entity/branch.entity';
import { CreateBranchDto, UpdateBranchDto } from './dto/create-branch.dto';
import { City } from 'src/company/entities/city.entity';
import { Country } from 'src/company/entities/country.entity';

@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(BranchEntity)
    private readonly branchRepository: Repository<BranchEntity>,

    @InjectRepository(Country)
    private readonly countryRepo: Repository<Country>,

    @InjectRepository(City)
    private readonly cityRepo: Repository<City>,
  ) {}

  async findAll(): Promise<{ message: string; data: BranchEntity[] }> {
    try {
      const branches = await this.branchRepository.find({
        relations: ['country', 'city'],
        where: { deleted: false },
        order: { createdAt: 'DESC' },
      });
      return { message: 'Branches retrieved successfully', data: branches };
    } catch (error) {
      throw new InternalServerErrorException('Failed to retrieve branches', error.message);
    }
  }

  async findOne(id: string): Promise<{ message: string; data: BranchEntity }> {
    try {
      const branch = await this.branchRepository.findOne({
        where: { id, deleted: false },
        relations: ['country', 'city'],
      });
      if (!branch) throw new NotFoundException(`Branch with id ${id} not found`);
      return { message: 'Branch retrieved successfully', data: branch };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to retrieve branch', error.message);
    }
  }

  async create(dto: CreateBranchDto): Promise<{ message: string; data: BranchEntity }> {
    try {
      const branch = this.branchRepository.create(dto);
      const saved = await this.branchRepository.save(branch);
      return { message: 'Branch created successfully', data: saved };
    } catch (error) {
      throw new InternalServerErrorException('Failed to create branch', error.message);
    }
  }

  async update(
    id: string,
    dto: UpdateBranchDto,
  ): Promise<{ message: string; data: BranchEntity }> {
    try {
      const branchResponse = await this.findOne(id);
      const branch = branchResponse.data;

      // Mises à jour simples
      if (dto.name !== undefined) branch.name = dto.name;
      if (dto.address !== undefined) branch.address = dto.address;
      if (dto.phone !== undefined) branch.phone = dto.phone;
      if (dto.email !== undefined) branch.email = dto.email;
      if (dto.status !== undefined) branch.status = dto.status;
      if (dto.deleted !== undefined) branch.deleted = dto.deleted;

      // Relations : country
      if (dto.countryId) {
        const country = await this.countryRepo.findOne({ where: { id: dto.countryId } });
        if (!country)
          throw new NotFoundException(`Pays avec l'ID ${dto.countryId} introuvable`);
        branch.country = country;
      }

      // Relations : city
      if (dto.cityId) {
        const city = await this.cityRepo.findOne({ where: { id: dto.cityId } });
        if (!city) throw new NotFoundException(`Ville avec l'ID ${dto.cityId} introuvable`);
        branch.city = city;
      }

      const updated = await this.branchRepository.save(branch);

      return { message: 'Branch updated successfully', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to update branch', error.message);
    }
  }

  async softDelete(id: string): Promise<{ message: string; data: { deleted: boolean } }> {
    try {
      const branchResponse = await this.findOne(id);
      branchResponse.data.deleted = true;
      await this.branchRepository.save(branchResponse.data);
      return { message: 'Branch deleted successfully', data: { deleted: true } };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to delete branch', error.message);
    }
  }
}
