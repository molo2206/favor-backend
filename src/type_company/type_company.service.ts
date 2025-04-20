import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeCompany } from './entities/type_company.entity';
import { CreateTypeCompanyDto } from './dto/create-type_company.dto';
import { UpdateTypeCompanyDto } from './dto/update-type_company.dto';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';

@Injectable()
export class TypeCompanyService {
  constructor(
    @InjectRepository(TypeCompany)
    private readonly typeCompanyRepository: Repository<TypeCompany>,
    private readonly cloudinary: CloudinaryService
  ) { }

  async create(
    createTypeCompanyDto: CreateTypeCompanyDto,
    file?: Express.Multer.File,
  ): Promise<{ data: TypeCompany }> {
    const existing = await this.typeCompanyRepository.findOne({
      where: { name: createTypeCompanyDto.name },
    });

    if (existing) {
      throw new BadRequestException(`Le type d’entreprise "${createTypeCompanyDto.name}" existe déjà.`);
    }

    if (file) {
      const imageUrl = await this.cloudinary.handleUploadImage(file, 'type-company');
      createTypeCompanyDto.image = imageUrl;
    }

    const newType = this.typeCompanyRepository.create(createTypeCompanyDto);
    const savedType = await this.typeCompanyRepository.save(newType);

    return { data: savedType };
  }

  async update(
    id: string,
    updateDto: UpdateTypeCompanyDto,
    file?: Express.Multer.File,
  ): Promise<TypeCompany> {
    // Vérifie si le type existe
    const type = await this.findOne(id);
    if (!type) {
      throw new NotFoundException(`Le type d'entreprise avec l'ID ${id} n'existe pas.`);
    }
    // Si un fichier est fourni, on l'upload et on met à jour l'image
    if (file) {
      const imageUrl = await this.cloudinary.handleUploadImage(file, 'type-company');
      updateDto.image = imageUrl;
    }
    // Mise à jour des propriétés du type
    Object.assign(type, updateDto);
    // Sauvegarde et retourne le type mis à jour
    return await this.typeCompanyRepository.save(type);
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

  async remove(id: string): Promise<{ message: string }> {
    const type = await this.findOne(id);
    await this.typeCompanyRepository.remove(type);
    return { message: 'Type d’entreprise supprimé avec succès.' };
  }
}
