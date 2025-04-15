import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeCompany } from './entities/type_company.entity';
import { CreateTypeCompanyDto } from './dto/create-type_company.dto';
import { UpdateTypeCompanyDto } from './dto/update-type_company.dto';

@Injectable()
export class TypeCompanyService {
  constructor(
    @InjectRepository(TypeCompany)
    private readonly typeCompanyRepository: Repository<TypeCompany>,
  ) { }

  async create(createTypeCompanyDto: CreateTypeCompanyDto): Promise<TypeCompany> {
    const newType = this.typeCompanyRepository.create(createTypeCompanyDto);
    return await this.typeCompanyRepository.save(newType);
  }

  async findAll(): Promise<TypeCompany[]> {
    return await this.typeCompanyRepository.find();
  }

  async findOne(id: string): Promise<TypeCompany> {
    const type = await this.typeCompanyRepository.findOne({ where: { id } });
    if (!type) {
      throw new NotFoundException('Type d’entreprise non trouvé.');
    }
    return type;
  }

  async update(id: string, updateDto: UpdateTypeCompanyDto): Promise<TypeCompany> {
    const type = await this.findOne(id);
    Object.assign(type, updateDto);
    return await this.typeCompanyRepository.save(type);
  }

  async remove(id: string): Promise<{ message: string }> {
    const type = await this.findOne(id);
    await this.typeCompanyRepository.remove(type);
    return { message: 'Type d’entreprise supprimé avec succès.' };
  }
}
