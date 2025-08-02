import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CreateRentalContractDto } from './dto/create-rental-contract.dto';
import { UpdateRentalContractDto } from './dto/update-rental-contract.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { RentalContract } from './entities/rental-contract.entity';
import { Repository } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { Product } from 'src/products/entities/product.entity';
import { RentalStatus } from './enum/rentalStatus.enum';

@Injectable()
export class RentalContractService {
  constructor(
    @InjectRepository(RentalContract)
    private rentalRepo: Repository<RentalContract>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
  ) {}

  async create(dto: CreateRentalContractDto, user: UserEntity): Promise<RentalContract> {
    const vehicle = await this.productRepo.findOneBy({ id: dto.vehicleId });
    if (!vehicle) throw new NotFoundException('Véhicule non trouvé');

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    const totalDays = Math.ceil((+end - +start) / (1000 * 60 * 60 * 24));
    const totalAmount = totalDays * (dto.dailyRate || vehicle.dailyRate || 0);

    const contract = this.rentalRepo.create({
      customer: user,
      vehicle,
      startDate: dto.startDate,
      endDate: dto.endDate,
      totalDays,
      dailyRate: dto.dailyRate || vehicle.dailyRate,
      totalAmount,
      status: dto.status ?? RentalStatus.PENDING,
    });

    return this.rentalRepo.save(contract);
  }

  async findAll(): Promise<RentalContract[]> {
    return this.rentalRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['customer', 'vehicle'],
    });
  }

  async findByUser(user: UserEntity): Promise<Partial<RentalContract>[]> {
    const contracts = await this.rentalRepo.find({
      where: { customer: { id: user.id } },
      order: { createdAt: 'DESC' },
      relations: ['vehicle', 'customer'],
    });

    // Supprimer customer des objets renvoyés
    return contracts.map(({ customer, ...rest }) => rest);
  }

  async findOne(id: string): Promise<RentalContract> {
    const contract = await this.rentalRepo.findOne({
      where: { id },
      relations: ['customer', 'vehicle'],
    });
    if (!contract) throw new NotFoundException('Contrat introuvable');
    return contract;
  }

  async update(id: string, dto: UpdateRentalContractDto): Promise<RentalContract> {
    const contract = await this.findOne(id);
    Object.assign(contract, dto);
    return this.rentalRepo.save(contract);
  }

  async cancel(id: string, user: UserEntity): Promise<RentalContract> {
    const contract = await this.findOne(id);

    if (contract.customer.id !== user.id) {
      throw new ForbiddenException('Vous ne pouvez pas annuler ce contrat');
    }

    if (contract.status !== RentalStatus.PENDING && contract.status !== RentalStatus.ACTIVE) {
      throw new ForbiddenException('Ce contrat ne peut pas être annulé');
    }

    contract.status = RentalStatus.CANCELLED;
    return this.rentalRepo.save(contract);
  }

  async remove(id: string): Promise<void> {
    const contract = await this.findOne(id);
    await this.rentalRepo.remove(contract);
  }
}
