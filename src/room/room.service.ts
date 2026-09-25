import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Room } from './entities/room.entity';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { MeasureEntity } from 'src/measure/entities/measure.entity';
import { RoomImage } from 'src/room-image/entities/room-image.entity';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { UserEntity } from 'src/users/entities/user.entity';
import { RoomStatus } from './enum/roomStatus.enum';
import { v4 as uuidv4 } from 'uuid';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { Like } from 'typeorm';

@Injectable()
export class RoomService {
  constructor(
    @InjectRepository(Room) private readonly roomRepo: Repository<Room>,
    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,
    @InjectRepository(MeasureEntity)
    private readonly measureRepo: Repository<MeasureEntity>,
    @InjectRepository(RoomImage)
    private readonly roomImageRepo: Repository<RoomImage>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async create(
    createRoomDto: CreateRoomDto,
    files: Express.Multer.File[],
    user: UserEntity,
  ): Promise<{ message: string; data: Room }> {
    const { measureId, status, ...data } = createRoomDto;

    if (!files || files.length < 1 || files.length > 5) {
      throw new BadRequestException('Vous devez fournir entre 1 et 5 images');
    }

    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active trouvée pour cet utilisateur');
    }

    const company = await this.companyRepo.findOne({
      where: { id: user.activeCompanyId },
    });

    if (!company) {
      throw new NotFoundException('Entreprise active introuvable');
    }

    if (company.typeCompany !== CompanyType.HOTEL) {
      throw new BadRequestException(
        "Impossible de créer une chambre : l'entreprise n'est pas de type HOTEL, veillez créer une entreprise de type HOTEL ou selectionner une entreprise de type HOTEL",
      );
    }

    let measure: MeasureEntity | null | undefined = undefined;
    if (measureId) {
      measure = await this.measureRepo.findOne({ where: { id: measureId } });
      if (!measure) {
        throw new NotFoundException('Unité de mesure non trouvée');
      }
    }

    const roomCode = `ROOM-${Math.floor(1000 + Math.random() * 9000)}-${uuidv4().slice(0, 4)}`;

    const mainImage = await this.cloudinary.handleUploadImage(files[0], 'room');

    const roomStatus = status || RoomStatus.AVAILABLE;

    const room = this.roomRepo.create({
      ...data,
      code: roomCode,
      company,
      measure,
      status: roomStatus,
    });

    await this.roomRepo.save(room);

    const roomImages: RoomImage[] = [];

    for (const file of files) {
      const uploaded = await this.cloudinary.handleUploadImage(file, 'room');
      const imageEntity = new RoomImage();
      imageEntity.url = uploaded;
      imageEntity.room = room;
      roomImages.push(imageEntity);
    }

    await this.roomImageRepo.save(roomImages);
    room.images = roomImages;

    return {
      message: 'Chambre créée avec succès',
      data: room,
    };
  }

  async findAll(companyId?: string): Promise<{ message: string; data: Room[] }> {
    const query = this.roomRepo
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.images', 'images')
      .leftJoinAndSelect('room.company', 'company');

    if (companyId) {
      query.where('room.companyId = :companyId', { companyId });
    }

    const rooms = await query.getMany();

    return {
      message: 'Liste des chambres récupérées avec succès',
      data: rooms,
    };
  }

  async findAvailableRooms(
    address: string,
    checkInDate: string,
    checkOutDate: string,
  ): Promise<Room[]> {
    const decodedAddress = decodeURIComponent(address.trim());

    const companies = await this.companyRepo
      .createQueryBuilder('company')
      .where('company.address LIKE :address', { address: `%${address}%` })
      .getMany();

    if (!companies || companies.length === 0) {
      throw new NotFoundException('Aucun hôtel trouvé pour cette adresse');
    }

    const companyIds = companies.map((c) => c.id);

    // Récupérer toutes les chambres disponibles
    const rooms = await this.roomRepo
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.images', 'images')
      .leftJoin('room.bookings', 'booking')
      .where('room.companyId IN (:...companyIds)', { companyIds })
      .andWhere(
        new Brackets((qb) => {
          qb.where('booking.id IS NULL') 
            .orWhere(
              'booking.checkOutDate <= :checkInDate OR booking.checkInDate >= :checkOutDate',
              { checkInDate, checkOutDate },
            );
        }),
      )
      .getMany();

    return rooms;
  }
  async findOne(id: string): Promise<{ message: string; data: Room }> {
    const room = await this.roomRepo.findOne({
      where: { id },
      relations: ['images', 'company'],
    });

    if (!room) {
      throw new NotFoundException(`Chambre avec l'ID ${id} introuvable`);
    }

    return {
      message: 'Chambre trouvée avec succès',
      data: room,
    };
  }

  async update(
    id: string,
    updateRoomDto: UpdateRoomDto,
    user: UserEntity,
  ): Promise<{ message: string; data: Room }> {
    const { data: room } = await this.findOne(id);

    Object.assign(room, updateRoomDto);

    await this.roomRepo.save(room);

    return {
      message: 'Chambre mise à jour avec succès',
      data: room,
    };
  }

  async remove(id: string): Promise<{ message: string }> {
    const { data: room } = await this.findOne(id);

    await this.roomRepo.remove(room);

    return { message: 'Chambre supprimée avec succès' };
  }
}
