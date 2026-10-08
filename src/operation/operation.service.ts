// src/operation/operation.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere } from 'typeorm';
import { CreateOperationDto } from './dto/create-operation.dto';
import { UpdateOperationStatusDto } from './dto/update-operation-status.dto';
import { OperationEntity } from './entity/operation.entity';
import { OperationStatus } from './enum/operation.status.enum';
import { PaymentMethod } from './enum/payment-method.enum';

@Injectable()
export class OperationService {
  private readonly logger = new Logger(OperationService.name);

  constructor(
    @InjectRepository(OperationEntity)
    private readonly operationRepo: Repository<OperationEntity>,
  ) { }

  /**
   * Crée une nouvelle opération financière.
   */
  async create(dto: CreateOperationDto): Promise<OperationEntity> {
    // Vérifier qu'au moins une référence est présente
    if (!dto.orderId && !dto.shipmentId && !dto.reservationId && !dto.hotelReservationId) {
      throw new BadRequestException(
        'orderId, shipmentId, reservationId ou hotelReservationId est requis',
      );
    }

    // Vérifier les montants
    if (dto.debit < 0 || dto.credit < 0) {
      throw new BadRequestException('Les montants débit et crédit ne peuvent pas être négatifs');
    }
    if (dto.debit > 0 && dto.credit > 0) {
      throw new BadRequestException('Une opération ne peut avoir à la fois un débit et un crédit');
    }
    if (dto.debit === 0 && dto.credit === 0) {
      throw new BadRequestException('Le montant débit ou crédit doit être supérieur à 0');
    }

    const operation = this.operationRepo.create(dto);
    return this.operationRepo.save(operation);
  }

  /**
   * Récupère toutes les opérations avec pagination et filtres.
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    filters?: {
      userId?: string;
      status?: OperationStatus;
      paymentMethod?: PaymentMethod;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<{ data: OperationEntity[]; total: number; page: number; limit: number }> {
    const where: FindOptionsWhere<OperationEntity> = {};
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.status) where.status = filters.status;
    if (filters?.paymentMethod) where.paymentMethod = filters.paymentMethod;
    if (filters?.startDate && filters?.endDate) {
      where.createdAt = Between(filters.startDate, filters.endDate);
    } else if (filters?.startDate) {
      where.createdAt = Between(filters.startDate, new Date());
    }

    const skip = (page - 1) * limit;
    const [data, total] = await this.operationRepo.findAndCount({
      where,
      relations: ['user', 'order', 'shipment', 'reservation', 'hotelReservation'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit };
  }

  /**
   * Récupère une opération par son ID.
   */
  async findOne(id: string): Promise<OperationEntity> {
    const operation = await this.operationRepo.findOne({
      where: { id },
      relations: ['user', 'order', 'shipment', 'reservation', 'hotelReservation'],
    });
    if (!operation) throw new NotFoundException(`Opération ${id} non trouvée`);
    return operation;
  }

  /**
   * Récupère les opérations d'un utilisateur.
   */
  async findByUser(userId: string): Promise<OperationEntity[]> {
    return this.operationRepo.find({
      where: { userId },
      relations: ['order', 'shipment', 'reservation', 'hotelReservation'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Récupère les opérations liées à une expédition.
   */
  async findByShipment(shipmentId: string): Promise<OperationEntity[]> {
    return this.operationRepo.find({
      where: { shipmentId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Récupère las opérations liées à une réservation d'hôtel.
   */
  async findByHotelReservation(hotelReservationId: string): Promise<OperationEntity[]> {
    return this.operationRepo.find({
      where: { hotelReservationId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Récupère les opérations liées à une réservation de voyage.
   */
  async findByReservation(reservationId: string): Promise<OperationEntity[]> {
    return this.operationRepo.find({
      where: { reservationId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Met à jour le statut d'une opération.
   */
  async updateStatus(id: string, dto: UpdateOperationStatusDto): Promise<OperationEntity> {
    const operation = await this.findOne(id);
    operation.status = dto.status;
    return this.operationRepo.save(operation);
  }

  /**
   * Annule une opération (passe le statut à FAILED) – uniquement si PENDING.
   */
  async cancelOperation(id: string, reason?: string): Promise<OperationEntity> {
    const operation = await this.findOne(id);
    if (operation.status === OperationStatus.ACCEPTED) {
      throw new BadRequestException('Impossible d’annuler une opération déjà acceptée');
    }
    operation.status = OperationStatus.FAILED;
    if (reason) {
      operation.designation += ` (Annulé : ${reason})`;
    }
    return this.operationRepo.save(operation);
  }

  /**
   * Calcule le solde d’un utilisateur (total crédit - total débit) sur les opérations acceptées.
   */
  async getUserBalance(userId: string): Promise<number> {
    const result = await this.operationRepo
      .createQueryBuilder('op')
      .select('SUM(op.credit)', 'totalCredit')
      .addSelect('SUM(op.debit)', 'totalDebit')
      .where('op.userId = :userId', { userId })
      .andWhere('op.status = :status', { status: OperationStatus.ACCEPTED })
      .getRawOne();
    const totalCredit = parseFloat(result?.totalCredit || 0);
    const totalDebit = parseFloat(result?.totalDebit || 0);
    return totalCredit - totalDebit;
  }

  /**
   * Statistiques globales des opérations.
   */
  async getStatistics(startDate?: Date, endDate?: Date): Promise<{
    totalDebit: number;
    totalCredit: number;
    byStatus: Record<OperationStatus, { count: number; amount: number }>;
    byPaymentMethod: Record<PaymentMethod, { count: number; amount: number }>;
  }> {
    const where: FindOptionsWhere<OperationEntity> = {};
    if (startDate && endDate) where.createdAt = Between(startDate, endDate);
    else if (startDate) where.createdAt = Between(startDate, new Date());

    const operations = await this.operationRepo.find({ where });

    const totalDebit = operations.reduce((s, o) => s + o.debit, 0);
    const totalCredit = operations.reduce((s, o) => s + o.credit, 0);

    const byStatus: any = {};
    const byPaymentMethod: any = {};

    for (const op of operations) {
      // Par statut
      if (!byStatus[op.status]) byStatus[op.status] = { count: 0, amount: 0 };
      byStatus[op.status].count++;
      byStatus[op.status].amount += op.credit || op.debit;

      // Par mode de paiement
      if (op.paymentMethod) {
        if (!byPaymentMethod[op.paymentMethod]) byPaymentMethod[op.paymentMethod] = { count: 0, amount: 0 };
        byPaymentMethod[op.paymentMethod].count++;
        byPaymentMethod[op.paymentMethod].amount += op.credit || op.debit;
      }
    }

    return { totalDebit, totalCredit, byStatus, byPaymentMethod };
  }

  /**
   * Supprime une opération (uniquement si le statut est PENDING).
   */
  async deleteOperation(id: string): Promise<void> {
    const operation = await this.findOne(id);
    if (operation.status !== OperationStatus.PENDING) {
      throw new BadRequestException('Seules les opérations en attente peuvent être supprimées');
    }
    await this.operationRepo.remove(operation);
  }
}