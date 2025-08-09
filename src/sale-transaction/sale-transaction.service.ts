import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSaleTransactionDto } from './dto/create-sale-transaction.dto';
import { UpdateSaleTransactionDto } from './dto/update-sale-transaction.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { Product } from 'src/products/entities/product.entity';
import { SaleTransaction } from './entities/sale-transaction.entity';
import { PaymentStatus } from './enum/paymentStatus.enum';

@Injectable()
export class SaleTransactionService {
  constructor(
    @InjectRepository(SaleTransaction)
    private readonly saleRepo: Repository<SaleTransaction>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async create(dto: CreateSaleTransactionDto, userId: string): Promise<SaleTransaction> {
    const customer = await this.userRepo.findOne({ where: { id: userId } });
    if (!customer) {
      throw new NotFoundException('Client non trouvé');
    }

    const vehicle = await this.productRepo.findOne({ where: { id: dto.vehicleId } });
    if (!vehicle) {
      throw new NotFoundException('Véhicule non trouvé');
    }

    // Calcul automatique du prix si non fourni
    const salePrice = dto.salePrice ?? vehicle.salePrice ?? 0;

    const transaction = this.saleRepo.create({
      customer,
      customerId: customer.id,
      vehicle,
      vehicleId: vehicle.id,
      salePrice,
      paymentStatus: dto.paymentStatus ?? PaymentStatus.PENDING,
      date: new Date(dto.date),
    });

    return this.saleRepo.save(transaction);
  }

  findAll(): Promise<SaleTransaction[]> {
    return this.saleRepo.find({
      relations: ['customer', 'vehicle'],
      order: { date: 'DESC' },
    });
  }

  async findOne(id: string): Promise<SaleTransaction> {
    const transaction = await this.saleRepo.findOne({
      where: { id },
      relations: ['customer', 'vehicle'],
    });
    if (!transaction) {
      throw new NotFoundException(`Transaction #${id} non trouvée`);
    }
    return transaction;
  }

  async findByUser(user: UserEntity): Promise<SaleTransaction[]> {
    return this.saleRepo.find({
      where: { customer: { id: user.id } },
      relations: ['customer', 'vehicle'],
      order: { date: 'DESC' },
    });
  }

  async update(id: string, dto: UpdateSaleTransactionDto): Promise<SaleTransaction> {
    const transaction = await this.findOne(id);

    // Gérer la mise à jour du véhicule uniquement si changé
    if (dto.vehicleId && dto.vehicleId !== transaction.vehicle.id) {
      const vehicle = await this.productRepo.findOne({ where: { id: dto.vehicleId } });
      if (!vehicle) throw new NotFoundException('Véhicule non trouvé');
      transaction.vehicle = vehicle;
    }

    if (dto.salePrice !== undefined) transaction.salePrice = dto.salePrice;
    if (dto.paymentStatus) transaction.paymentStatus = dto.paymentStatus;
    if (dto.date) transaction.date = new Date(dto.date);

    return this.saleRepo.save(transaction);
  }

  async remove(id: string): Promise<void> {
    const transaction = await this.findOne(id);
    await this.saleRepo.remove(transaction);
  }
}
