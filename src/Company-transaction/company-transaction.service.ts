// src/company/services/company-transaction.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere } from 'typeorm';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import {
  CompanyTransactionEntity,
  TransactionStatus,
  TransactionType,
} from './entity/company-transaction.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { CreateCompanyTransactionDto } from './dto/create-company-transaction.dto';
import { UpdateCompanyTransactionDto } from './dto/update-company-transaction.dto';

@Injectable()
export class CompanyTransactionService {
  constructor(
    @InjectRepository(CompanyTransactionEntity)
    private readonly transactionRepo: Repository<CompanyTransactionEntity>,
    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,
    @InjectRepository(Shipment)
    private readonly shipmentRepo: Repository<Shipment>,
    @InjectRepository(LtaEntity)
    private readonly ltaRepo: Repository<LtaEntity>,
  ) {}

  async create(
    dto: CreateCompanyTransactionDto,
  ): Promise<{ message: string; data: CompanyTransactionEntity }> {
    // Vérifier que la société existe
    const company = await this.companyRepo.findOne({
      where: { id: dto.companyId },
    });
    if (!company) {
      throw new NotFoundException(
        `Société avec l'ID ${dto.companyId} non trouvée`,
      );
    }

    // Vérifier le shipment si fourni
    if (dto.shipmentId) {
      const shipment = await this.shipmentRepo.findOne({
        where: { id: dto.shipmentId },
      });
      if (!shipment) {
        throw new NotFoundException(
          `Shipment avec l'ID ${dto.shipmentId} non trouvé`,
        );
      }
    }

    // Vérifier la LTA si fournie
    if (dto.ltaId) {
      const lta = await this.ltaRepo.findOne({ where: { id: dto.ltaId } });
      if (!lta) {
        throw new NotFoundException(`LTA avec l'ID ${dto.ltaId} non trouvée`);
      }
    }

    const transaction = this.transactionRepo.create({
      ...dto,
      status: dto.status || TransactionStatus.PENDING,
      paid: dto.paid ?? false,
    });

    const saved = await this.transactionRepo.save(transaction);
    return { message: 'Transaction créée avec succès', data: saved };
  }

  async findAll(
    companyId?: string,
    page: number = 1,
    limit: number = 10,
    type?: TransactionType,
    status?: TransactionStatus,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    data: CompanyTransactionEntity[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    const where: FindOptionsWhere<CompanyTransactionEntity> = {};

    if (companyId) where.companyId = companyId;
    if (type) where.type = type;
    if (status) where.status = status;
    if (startDate && endDate) {
      where.createdAt = Between(startDate, endDate);
    }

    const [data, total] = await this.transactionRepo.findAndCount({
      where,
      relations: ['company', 'shipment', 'lta'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<{ data: CompanyTransactionEntity }> {
    const transaction = await this.transactionRepo.findOne({
      where: { id },
      relations: ['company', 'shipment', 'lta'],
    });
    if (!transaction) {
      throw new NotFoundException(`Transaction avec l'ID ${id} non trouvée`);
    }
    return { data: transaction };
  }

  async update(
    id: string,
    dto: UpdateCompanyTransactionDto,
  ): Promise<{ message: string; data: CompanyTransactionEntity }> {
    const transaction = await this.transactionRepo.findOne({ where: { id } });
    if (!transaction) {
      throw new NotFoundException(`Transaction avec l'ID ${id} non trouvée`);
    }

    // Mise à jour des relations si nécessaire
    if (dto.shipmentId !== undefined) {
      const shipment = await this.shipmentRepo.findOne({
        where: { id: dto.shipmentId },
      });
      if (!shipment && dto.shipmentId) {
        throw new NotFoundException(
          `Shipment avec l'ID ${dto.shipmentId} non trouvé`,
        );
      }
      transaction.shipmentId = dto.shipmentId;
    }

    if (dto.ltaId !== undefined) {
      const lta = await this.ltaRepo.findOne({ where: { id: dto.ltaId } });
      if (!lta && dto.ltaId) {
        throw new NotFoundException(`LTA avec l'ID ${dto.ltaId} non trouvée`);
      }
      transaction.ltaId = dto.ltaId;
    }

    Object.assign(transaction, dto);
    const updated = await this.transactionRepo.save(transaction);
    return { message: 'Transaction mise à jour avec succès', data: updated };
  }

  async updateStatus(
    id: string,
    status: TransactionStatus,
  ): Promise<{ message: string; data: CompanyTransactionEntity }> {
    const transaction = await this.transactionRepo.findOne({ where: { id } });
    if (!transaction) {
      throw new NotFoundException(`Transaction avec l'ID ${id} non trouvée`);
    }
    transaction.status = status;
    const updated = await this.transactionRepo.save(transaction);
    return { message: 'Statut de la transaction mis à jour', data: updated };
  }

  async updatePaidStatus(
    id: string,
    paid: boolean,
  ): Promise<{ message: string; data: CompanyTransactionEntity }> {
    const transaction = await this.transactionRepo.findOne({ where: { id } });
    if (!transaction) {
      throw new NotFoundException(`Transaction avec l'ID ${id} non trouvée`);
    }
    transaction.paid = paid;
    const updated = await this.transactionRepo.save(transaction);
    return { message: 'Statut de paiement mis à jour', data: updated };
  }

  async remove(id: string): Promise<{ message: string }> {
    const transaction = await this.transactionRepo.findOne({ where: { id } });
    if (!transaction) {
      throw new NotFoundException(`Transaction avec l'ID ${id} non trouvée`);
    }
    await this.transactionRepo.remove(transaction);
    return { message: 'Transaction supprimée avec succès' };
  }

  async getCompanyBalance(
    companyId: string,
  ): Promise<{ balance: number; totalDebit: number; totalCredit: number }> {
    const transactions = await this.transactionRepo.find({
      where: { companyId, status: TransactionStatus.COMPLETED },
    });

    let totalDebit = 0;
    let totalCredit = 0;

    for (const transaction of transactions) {
      if (transaction.type === TransactionType.DEBIT) {
        totalDebit += transaction.amount;
      } else {
        totalCredit += transaction.amount;
      }
    }

    const balance = totalCredit - totalDebit;

    return { balance, totalDebit, totalCredit };
  }

  async getCompanyTransactionsByPeriod(
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ data: CompanyTransactionEntity[]; total: number }> {
    const [data, total] = await this.transactionRepo.findAndCount({
      where: {
        companyId,
        createdAt: Between(startDate, endDate),
      },
      relations: ['shipment', 'lta'],
      order: { createdAt: 'DESC' },
    });
    return { data, total };
  }
}
