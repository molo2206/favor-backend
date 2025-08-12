import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSaleTransactionDto } from './dto/create-sale-transaction.dto';
import { UpdateSaleTransactionDto } from './dto/update-sale-transaction.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { Product } from 'src/products/entities/product.entity';
import { SaleTransaction } from './entities/sale-transaction.entity';
import { PaymentStatus } from './enum/paymentStatus.enum';
import { InvoiceService } from 'src/order/invoice/invoice.util';
import { MailOrderService } from 'src/email/emailorder.service';
import * as QRCode from 'qrcode';
import { UpdateSaleStatusDto } from './dto/UpdateSaleStatusDto';

@Injectable()
export class SaleTransactionService {
  constructor(
    @InjectRepository(SaleTransaction)
    private readonly saleRepo: Repository<SaleTransaction>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,

    private readonly invoiceService: InvoiceService,

    private readonly mailService: MailOrderService,
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

    // Vérification quantité disponible
    if (vehicle.quantity === undefined || vehicle.quantity === null || vehicle.quantity <= 0) {
      throw new BadRequestException('Produit en rupture de stock');
    }

    // Conversion sécurisée en number
    const requestedQuantity: number = dto.quantity ? parseInt(dto.quantity as any, 10) : 1;

    if (requestedQuantity > vehicle.quantity) {
      throw new BadRequestException(
        `Quantité demandée (${requestedQuantity}) supérieure à la quantité disponible (${vehicle.quantity})`,
      );
    }

    vehicle.quantity = vehicle.quantity - requestedQuantity;
    await this.productRepo.save(vehicle);

    const salePrice = vehicle.salePrice ?? 0;
    const paymentStatus = PaymentStatus.PENDING;
    const date = new Date();

    const transaction = this.saleRepo.create({
      customer,
      customerId: customer.id,
      vehicle,
      vehicleId: vehicle.id,
      salePrice,
      paymentStatus,
      date,
      quantity: requestedQuantity,
      saleNumber: this.invoiceService.generateInvoiceNumber(),
    });
    const user = customer;
    const subOrders = [];
    const paymentQrCode = await QRCode.toDataURL(transaction.saleNumber);
    await this.mailService.sendInvoiceCarWithPdf(
      customer.email,
      'Votre facture PDF - FavorHelp',
      {
        user,
        order: {
          id: transaction.id,
          totalAmount: transaction.salePrice,
          currency: 'USD',
          invoiceNumber: transaction.saleNumber,
          address: user.address,
          paymentStatus: transaction.paymentStatus,
          date:
            transaction.date instanceof Date
              ? transaction.date.toISOString()
              : String(transaction.date),
        },
        subOrders,
        paymentQrCode,
      },
    );

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
  async updateSaleTransactionStatus(
    transactionId: string,
    dto: UpdateSaleStatusDto,
  ): Promise<{ data: SaleTransaction; message: string }> {
    const transaction = await this.saleRepo.findOne({
      where: { id: transactionId },
      relations: ['customer', 'vehicle'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction introuvable');
    }

    transaction.paymentStatus = dto.status;

    if (dto.status === PaymentStatus.VALIDATED) {
      transaction.paymentStatus = PaymentStatus.PAID;
      transaction.paid = true;
    }

    const updatedTransaction = await this.saleRepo.save(transaction);

    const fullTransaction = await this.saleRepo.findOne({
      where: { id: transactionId },
      relations: ['customer', 'vehicle'],
    });

    return {
      message: 'Transaction mise à jour avec succès',
      data: fullTransaction!,
    };
  }

  async update(id: string, dto: UpdateSaleTransactionDto): Promise<SaleTransaction> {
    const transaction = await this.findOne(id);

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
