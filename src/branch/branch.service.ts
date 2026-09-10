import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { BranchEntity } from './entity/branch.entity';
import { CreateBranchDto, UpdateBranchDto } from './dto/create-branch.dto';
import { City } from 'src/company/entities/city.entity';
import { Country } from 'src/company/entities/country.entity';
import { UserEntity } from 'src/users/entities/user.entity';

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

  async findAll(
    companyId: string,
  ): Promise<{ message: string; data: BranchEntity[] }> {
    try {
      const branches = await this.branchRepository.find({
        where: {
          company_id: companyId,
          deleted: false,
        },
        relations: ['country', 'city'],
        order: { createdAt: 'DESC' },
      });
      return { message: 'Branches retrieved successfully', data: branches };
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to retrieve branches',
        error.message,
      );
    }
  }

  async findOne(id: string): Promise<{ message: string; data: BranchEntity }> {
    try {
      const branch = await this.branchRepository.findOne({
        where: { id, deleted: false },
        relations: ['country', 'city'],
      });
      if (!branch)
        throw new NotFoundException(`Branch with id ${id} not found`);
      return { message: 'Branch retrieved successfully', data: branch };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        'Failed to retrieve branch',
        error.message,
      );
    }
  }

  async create(
    dto: CreateBranchDto,
    companyId: string,
  ): Promise<{ message: string; data: BranchEntity }> {
    try {
      const inputDto = Array.isArray(dto) ? dto[0] : dto;

      // ✅ Typer explicitement branchData avec DeepPartial<BranchEntity>
      const branchData: DeepPartial<BranchEntity> = {
        name: inputDto.name,
        address: inputDto.address,
        phone: inputDto.phone,
        email: inputDto.email,
        status: inputDto.status ?? true,
        deleted: inputDto.deleted ?? false,
        company_id: companyId,
      };

      if (inputDto.countryId) {
        const country = await this.countryRepo.findOne({
          where: { id: inputDto.countryId },
        });
        if (country) {
          branchData.countryId = inputDto.countryId;
        } else {
          throw new BadRequestException(
            `Pays avec l'ID ${inputDto.countryId} inexistant`,
          );
        }
      }

      if (inputDto.cityId) {
        const city = await this.cityRepo.findOne({
          where: { id: inputDto.cityId },
        });
        if (city) {
          branchData.cityId = inputDto.cityId;
        } else {
          throw new BadRequestException(
            `Ville avec l'ID ${inputDto.cityId} inexistante`,
          );
        }
      }

      // ✅ create() retourne maintenant BranchEntity, pas un tableau
      const branch = this.branchRepository.create(branchData);
      const saved = await this.branchRepository.save(branch);

      return { message: 'Branch created successfully', data: saved };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        'Failed to create branch',
        error.message,
      );
    }
  }

  async update(
    id: string,
    dto: UpdateBranchDto,
    user: UserEntity,
  ): Promise<{ message: string; data: BranchEntity }> {
    try {
      // 1. Récupérer la branche avec la relation company
      const branch = await this.branchRepository.findOne({
        where: { id },
        relations: ['company'],
      });
      if (!branch) {
        throw new NotFoundException(`Branche avec l'ID ${id} introuvable`);
      }

      // 2. Vérifier que la branche appartient à l'entreprise active de l'utilisateur
      if (branch.company_id !== user.activeCompanyId) {
        throw new ForbiddenException(
          'Vous ne pouvez modifier que les branches de votre entreprise active',
        );
      }

      // 3. Mise à jour des champs simples
      if (dto.name !== undefined) branch.name = dto.name;
      if (dto.address !== undefined) branch.address = dto.address;
      if (dto.phone !== undefined) branch.phone = dto.phone;
      if (dto.email !== undefined) branch.email = dto.email;
      if (dto.status !== undefined) branch.status = dto.status;
      if (dto.deleted !== undefined) branch.deleted = dto.deleted;

      // 4. Mise à jour des relations (country, city)
      if (dto.countryId) {
        const country = await this.countryRepo.findOne({
          where: { id: dto.countryId },
        });
        if (!country) {
          throw new NotFoundException(
            `Pays avec l'ID ${dto.countryId} introuvable`,
          );
        }
        branch.country = country;
        branch.countryId = country.id;
      }

      if (dto.cityId) {
        const city = await this.cityRepo.findOne({ where: { id: dto.cityId } });
        if (!city) {
          throw new NotFoundException(
            `Ville avec l'ID ${dto.cityId} introuvable`,
          );
        }
        branch.city = city;
        branch.cityId = city.id;
      }

      // 5. Sauvegarde
      const updated = await this.branchRepository.save(branch);

      return { message: 'Branch updated successfully', data: updated };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to update branch',
        error.message,
      );
    }
  }

  async softDelete(
    id: string,
  ): Promise<{ message: string; data: { deleted: boolean } }> {
    try {
      const branchResponse = await this.findOne(id);
      branchResponse.data.deleted = true;
      await this.branchRepository.save(branchResponse.data);
      return {
        message: 'Branch deleted successfully',
        data: { deleted: true },
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        'Failed to delete branch',
        error.message,
      );
    }
  }
}
