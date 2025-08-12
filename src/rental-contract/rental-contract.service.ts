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
import { UpdateRentalContractStatusDto } from './dto/UpdateRentalContractStatusDto';

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

    if (start > end)
      throw new BadRequestException('La date de début doit être avant la date de fin');

    const overlappingCount = await this.rentalRepo
      .createQueryBuilder('rental_contracts')
      .where('rental_contracts.vehicleId = :vehicleId', { vehicleId: vehicle.id })
      .andWhere('rental_contracts.status IN (:...statuses)', {
        statuses: [RentalStatus.PENDING, RentalStatus.VALIDATED],
      })
      .andWhere('(rental_contracts.startDate <= :end AND rental_contracts.endDate >= :start)', {
        start,
        end,
      })
      .getCount();

    if (overlappingCount > 0) {
      throw new BadRequestException('Le véhicule est déjà loué pendant cette période');
    }

    const diffTime = end.getTime() - start.getTime();
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const dailyRate = dto.dailyRate ?? vehicle.dailyRate ?? 0;
    const quantity = dto.quantity ? parseInt(dto.quantity as any) : 1;
    const totalAmount = totalDays * dailyRate * quantity;

    const contract = this.rentalRepo.create({
      customer: user,
      vehicle,
      startDate: dto.startDate,
      endDate: dto.endDate,
      totalDays,
      dailyRate,
      totalAmount,
      status: dto.status ?? RentalStatus.PENDING,
      quantity,
      rentalNumber: this.invoiceService.generateInvoiceNumber(),
    });

    const savedContract = await this.rentalRepo.save(contract);
    return savedContract;
  }

  async updateRentalContractStatus(
    contractId: string,
    dto: UpdateRentalContractStatusDto,
  ): Promise<{ data: RentalContract; message: string }> {
    const contract = await this.rentalRepo.findOneBy({ id: contractId });

    if (!contract) {
      throw new NotFoundException('Contrat de location introuvable');
    }

    contract.status = dto.status;

    if (dto.status === RentalStatus.VALIDATED) {
      contract.status = RentalStatus.PAID;
      contract.paid = true;
    }
    const updatedContract = await this.rentalRepo.save(contract);

    return {
      message: `Le statut du contrat ${contractId} a été mis à jour avec succès.`,
      data: updatedContract,
    };
  }

  async findAll(): Promise<RentalContract[]> {
    return this.rentalRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['customer', 'vehicle.category', 'vehicle.company'],
    });
  }

  async findByUser(user: UserEntity): Promise<Partial<RentalContract>[]> {
    const contracts = await this.rentalRepo.find({
      where: { customer: { id: user.id } },
      order: { createdAt: 'DESC' },
      relations: ['customer', 'vehicle.category', 'vehicle.company'],
    });

    // Supprimer customer des objets renvoyés
    return contracts.map(({ customer, ...rest }) => rest);
  }

  async findOne(id: string): Promise<RentalContract> {
    const contract = await this.rentalRepo.findOne({
      where: { id },
      relations: ['customer', 'vehicle.category', 'vehicle.company'],
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

    if (
      contract.status !== RentalStatus.PENDING &&
      contract.status !== RentalStatus.VALIDATED
    ) {
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
