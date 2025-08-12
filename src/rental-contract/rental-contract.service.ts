import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CreateRentalContractDto } from './dto/create-rental-contract.dto';
import { UpdateRentalContractDto } from './dto/update-rental-contract.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { RentalContract } from './entities/rental-contract.entity';
import { Repository } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { Product } from 'src/products/entities/product.entity';
import { RentalStatus } from './enum/rentalStatus.enum';
import { InvoiceService } from 'src/order/invoice/invoice.util';

@Injectable()
export class RentalContractService {
  constructor(
    @InjectRepository(RentalContract)
    private rentalRepo: Repository<RentalContract>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    private readonly invoiceService: InvoiceService,
  ) {}

  async create(dto: CreateRentalContractDto, user: UserEntity): Promise<RentalContract> {
    const vehicle = await this.productRepo.findOneBy({ id: dto.vehicleId });
    if (!vehicle) throw new NotFoundException('Véhicule non trouvé');

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (start >= end)
      throw new BadRequestException('La date de début doit être avant la date de fin');

    // Vérification chevauchement contrats actifs
    const overlappingCount = await this.rentalRepo
      .createQueryBuilder('rental_contracts')
      .where('rental_contracts.vehicleId = :vehicleId', { vehicleId: vehicle.id })
      .andWhere('rental_contracts.status IN (:...statuses)', {
        statuses: [RentalStatus.PENDING, RentalStatus.ACTIVE],
      })
      .andWhere('(rental_contracts.startDate <= :end AND rental_contracts.endDate >= :start)', {
        start,
        end,
      })
      .getCount();

    if (overlappingCount > 0) {
      throw new BadRequestException('Le véhicule est déjà loué pendant cette période');
    }

    // Vérification quantité disponible
    if (vehicle.quantity && vehicle.quantity > 0) {
      const result = await this.rentalRepo
        .createQueryBuilder('rental_contracts')
        .select('SUM(rental_contracts.quantity)', 'totalBooked')
        .where('rental_contracts.vehicleId = :vehicleId', { vehicleId: vehicle.id })
        .andWhere('rental_contracts.status IN (:...statuses)', {
          statuses: [RentalStatus.PENDING, RentalStatus.ACTIVE],
        })
        .andWhere(
          '(rental_contracts.startDate <= :end AND rental_contracts.endDate >= :start)',
          { start, end },
        )
        .getRawOne();

      const bookedQuantity = parseInt(result.totalBooked, 10) || 0;
      const requestedQuantity = dto.quantity ? parseInt(dto.quantity, 10) : 1;

      if (bookedQuantity + requestedQuantity >= vehicle.quantity) {
        throw new BadRequestException('Quantité insuffisante disponible pour cette période');
      }
    }

    const totalDays = Math.ceil((+end - +start) / (1000 * 60 * 60 * 24));
    const dailyRate = dto.dailyRate ?? vehicle.dailyRate ?? 0;
    const totalAmount = totalDays * dailyRate * (parseInt(dto.quantity as any) ?? 1);

    const contract = this.rentalRepo.create({
      customer: user,
      vehicle,
      startDate: dto.startDate,
      endDate: dto.endDate,
      totalDays,
      dailyRate,
      totalAmount,
      status: dto.status ?? RentalStatus.PENDING,
      quantity: parseInt(dto.quantity as any) ?? 1,
      rentalNumber: this.invoiceService.generateInvoiceNumber(),
    });

    // Sauvegarde du contrat
    const savedContract = await this.rentalRepo.save(contract);

    if (vehicle.quantity !== undefined && vehicle.quantity !== null && vehicle.quantity > 0) {
      const requestedQuantity: number = dto.quantity ? parseInt(dto.quantity, 10) : 1;

      const newQuantity = vehicle.quantity - requestedQuantity;

      if (newQuantity < 0) {
        throw new BadRequestException(
          'La quantité disponible est insuffisante pour cette réservation.',
        );
      }
    }

    return savedContract;
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
