import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignCourierDto } from './dto/assign-courier.dto';
import { ColisEntity } from './entity/colis.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { CreateColisDto } from './dto/create-colis.dto';
import { SetColisPriceDto } from './dto/set-price.dto';
import { ColisStatus } from './enum/colis-status.enum';

@Injectable()
export class ColisService {
  constructor(
    @InjectRepository(ColisEntity)
    private parcelRepository: Repository<ColisEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
  ) {}

  // Créer un colis
  async createParcel(createParcelDto: CreateColisDto, userId: string): Promise<ColisEntity> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const colis = this.parcelRepository.create({
      ...createParcelDto,
      status: ColisStatus.PENDING,
    });

    return this.parcelRepository.save(colis);
  }

  async setPrice(coliId: string, setParcelPriceDto: SetColisPriceDto): Promise<ColisEntity> {
    const parcel = await this.parcelRepository.findOne({ where: { id: coliId } });

    if (!parcel) {
      throw new NotFoundException('Colis non trouvé');
    }

    parcel.price = setParcelPriceDto.price;
    parcel.status = ColisStatus.PRICED;

    return this.parcelRepository.save(parcel);
  }

}
