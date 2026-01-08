import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeTransport } from './entity/type-transport.entity';
import { CreateTypeTransportDto } from './dto/create-type-transport.dto';
import { UpdateTypeTransportDto } from './dto/update-type-transport.dto';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';

@Injectable()
export class TypeTransportService {
  constructor(
    @InjectRepository(TypeTransport)
    private transportRepo: Repository<TypeTransport>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async create(
    createDto: CreateTypeTransportDto,
    file: Express.Multer.File,
  ): Promise<{ message: string; data: TypeTransport }> {
    const { name, description } = createDto;

    const existing = await this.transportRepo.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException('Ce type de transport existe déjà');
    }

    if (!file) {
      throw new BadRequestException('Une image est requise');
    }

    const imageUrl = await this.cloudinary.handleUploadImage(file, 'transport-types');

    const transport = this.transportRepo.create({
      name,
      description,
      image: imageUrl,
    });

    const savedTransport = await this.transportRepo.save(transport);

    return {
      message: 'Type de transport créé avec succès',
      data: savedTransport,
    };
  }

  async findAll(): Promise<{ message: string; data: TypeTransport[] }> {
    const transports = await this.transportRepo.find();
    return { message: 'Liste des types de transport récupérée', data: transports };
  }

  async findOne(id: string): Promise<{ message: string; data: TypeTransport }> {
    const transport = await this.transportRepo.findOne({ where: { id } });
    if (!transport) throw new NotFoundException('TypeTransport non trouvé');
    return { message: 'Type de transport retrouvé', data: transport };
  }

  // Modifier un type de transport
  async update(
    id: string,
    updateDto: UpdateTypeTransportDto,
  ): Promise<{ message: string; data: TypeTransport }> {
    const transport = await this.transportRepo.findOne({ where: { id } });
    if (!transport) throw new NotFoundException('TypeTransport non trouvé');
    Object.assign(transport, updateDto);
    const updated = await this.transportRepo.save(transport);
    return { message: 'Type de transport mis à jour', data: updated };
  }

  // Supprimer un type de transport
  async remove(id: string): Promise<{ message: string }> {
    const transport = await this.transportRepo.findOne({ where: { id } });
    if (!transport) throw new NotFoundException('TypeTransport non trouvé');
    await this.transportRepo.remove(transport);
    return { message: 'Type de transport supprimé avec succès' };
  }
}
