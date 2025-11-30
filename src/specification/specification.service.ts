import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Specification } from './entities/Specification.entity';
import { CategorySpecification } from './entities/CategorySpecification.entity';
import { ProductSpecificationValue } from './entities/ProductSpecificationValue.entity';
import { CreateSpecificationDto } from './dto/create-specification.dto';
import { UpdateSpecificationDto } from './dto/update-specification.dto';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { normalizeOptions } from 'src/users/utility/helpers/normalize-options.util';

@Injectable()
export class SpecificationService {
  constructor(
    @InjectRepository(Specification)
    private specRepo: Repository<Specification>,
    @InjectRepository(CategorySpecification)
    private catSpecRepo: Repository<CategorySpecification>,
    @InjectRepository(ProductSpecificationValue)
    private productSpecRepo: Repository<ProductSpecificationValue>,

    private readonly cloudinary: CloudinaryService,
  ) {}

  // Créer une spécification
  async create(
    dto: CreateSpecificationDto,
    file?: Express.Multer.File, // ✅ image non obligatoire
  ): Promise<{ message: string; data: Specification }> {
    const { key, label, type, unit, options } = dto;

    // 🔹 Vérifie si la clé existe déjà
    const existingSpec = await this.specRepo.findOne({ where: { key } });
    if (existingSpec) {
      throw new ConflictException('Une spécification avec cette clé existe déjà');
    }

    // 🔹 Upload facultatif de l’image
    let imageUrl: string | undefined;
    if (file) {
      imageUrl = await this.cloudinary.handleUploadImage(file, 'specifications');
    }

    // 🔹 Conversion des options (accepte CSV, JSON ou tableau)
    let parsedOptions: any = null;
    if (options) {
      try {
        parsedOptions = Array.isArray(options)
          ? options
          : options.includes(',')
            ? options.split(',').map((o) => o.trim())
            : JSON.parse(options);
      } catch {
        throw new BadRequestException('Le format des options est invalide');
      }
    }

    // 🔹 Création de la spécification
    const spec = this.specRepo.create({
      key,
      label,
      type,
      unit,
      options: parsedOptions,
      ...(imageUrl && { image: imageUrl }), // ✅ ajoute "image" seulement si elle existe
      deleted: false,
      status: true,
    });

    const savedSpec = await this.specRepo.save(spec);

    return {
      message: 'Spécification créée avec succès',
      data: savedSpec,
    };
  }

  async update(
    id: string,
    dto: UpdateSpecificationDto,
    file?: Express.Multer.File,
  ): Promise<{ message: string; data: Specification }> {
    const spec = await this.specRepo.findOne({ where: { id } });
    if (!spec) throw new NotFoundException(`Spécification ${id} introuvable`);

    // 🔹 KEY
    if (dto.key !== undefined) spec.key = dto.key;

    // 🔹 LABEL
    if (dto.label !== undefined) spec.label = dto.label;

    // 🔹 TYPE
    if (dto.type !== undefined) spec.type = dto.type;

    // 🔹 UNIT
    if (dto.unit !== undefined) spec.unit = dto.unit;

    // ------------------------------------------------------------
    // 🔥 GESTION DES OPTIONS
    // ------------------------------------------------------------
    if (dto.type === 'SELECT') {
      // options obligatoires pour SELECT
      if (!dto.options || dto.options.length === 0) {
        throw new BadRequestException(
          'Les options sont obligatoires lorsque le type est SELECT.',
        );
      }

      spec.options = normalizeOptions(dto.options);
    } else {
      // si le type n'est pas SELECT → vider les options
      spec.options = null;
    }

    // 🔹 IMAGE
    if (file) {
      spec.image = await this.cloudinary.handleUploadImage(file, 'specifications');
    }

    const savedSpec = await this.specRepo.save(spec);

    return {
      message: 'Spécification mise à jour avec succès',
      data: savedSpec,
    };
  }

  // Récupérer toutes les spécifications
  async findAll() {
    const specs = await this.specRepo.find({
      relations: ['categories', 'specificationValues'],
    });
    return { message: 'Liste des spécifications récupérée avec succès', data: specs };
  }

  // Récupérer une spécification par ID
  async findOne(id: string) {
    const spec = await this.specRepo.findOne({
      where: { id },
      relations: ['categories', 'specificationValues'],
    });
    if (!spec) throw new NotFoundException(`Spécification ${id} introuvable`);
    return { message: 'Spécification récupérée avec succès', data: spec };
  }

  // Supprimer une spécification
  async remove(id: string) {
    const spec = await this.specRepo.findOne({ where: { id } });
    if (!spec) throw new NotFoundException(`Spécification ${id} introuvable`);
    await this.specRepo.remove(spec);
    return { message: 'Spécification supprimée avec succès', data: null };
  }

  // Récupérer les spécifications pour une catégorie
  async findByCategory(categoryId: string) {
    const catSpecs = await this.catSpecRepo.find({
      where: { categoryId },
      relations: ['specification'],
      order: { displayOrder: 'ASC' },
    });
    return {
      message: `Spécifications de la catégorie ${categoryId} récupérées`,
      data: catSpecs.map((cs) => cs.specification),
    };
  }
}
