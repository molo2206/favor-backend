import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliveryEntity } from './entities/delivery.entity';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { OrderEntity } from 'src/order/entities/order.entity';
import { DeliveryStatus } from './enums/delivery.enum.status';
import { TrackingEntity } from 'src/tracking/entities/tracking.entity';
import { CreateTrackingDto } from 'src/tracking/dto/create-tracking.dto';
import { EventsGateway } from 'src/events/events.gateway';

@Injectable()
export class DeliveryService {
  constructor(
    @InjectRepository(DeliveryEntity)
    private readonly deliveryRepository: Repository<DeliveryEntity>,

    @InjectRepository(CompanyEntity)
    private readonly companyRepository: Repository<CompanyEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,

    @InjectRepository(OrderEntity)
    private readonly orderRepository: Repository<OrderEntity>,

    @InjectRepository(TrackingEntity)
    private readonly trackingRepository: Repository<TrackingEntity>,

    private readonly eventsGateway: EventsGateway,
  ) {}

  async create(
    createDeliveryDto: CreateDeliveryDto,
  ): Promise<{ message: string; data: DeliveryEntity }> {
    const { invoiceNumber, deliveryCompanyId, estimatedDeliveryTime } =
      createDeliveryDto;

    // 1. Trouver la commande via invoiceNumber
    const order = await this.orderRepository.findOne({
      where: { invoiceNumber },
      relations: ['subOrders', 'subOrders.items', 'user'],
    });

    if (!order) {
      throw new NotFoundException('Commande de livraison non trouvée.');
    }

    // 🛑 Vérifier si une livraison existe déjà pour cette commande
    const existingDelivery = await this.deliveryRepository.findOne({
      where: { order: { id: order.id } },
    });

    if (existingDelivery) {
      throw new ConflictException(
        'Une livraison a déjà été créée pour cette commande.',
      );
    }

    // 2. Trouver l'entreprise de livraison
    const deliveryCompany = await this.companyRepository.findOne({
      where: { id: deliveryCompanyId },
    });

    if (!deliveryCompany) {
      throw new NotFoundException('Entreprise de livraison non trouvée.');
    }

    // 3. Créer la livraison
    const delivery = this.deliveryRepository.create({
      deliveryCompany,
      order,
      currentStatus: DeliveryStatus.IN_TRANSIT,
      estimatedDeliveryTime,
    });

    await this.deliveryRepository.save(delivery);

    // 4. Créer le suivi initial
    const tracking = this.trackingRepository.create({
      status: DeliveryStatus.IN_TRANSIT,
      location: 'Inconnue',
      notes: 'Livraison en cours de traitement',
      delivery,
    });

    await this.trackingRepository.save(tracking);

    // 5. Recharger la livraison avec toutes les relations
    const fullDelivery = await this.deliveryRepository.findOne({
      where: { id: delivery.id },
      relations: ['order', 'deliveryCompany', 'livreur', 'trackings'],
    });

    if (!fullDelivery) {
      throw new NotFoundException("La livraison n'a pas pu être retrouvée.");
    }

    return { message: 'Traitement réussi avec succès', data: fullDelivery };
  }

  async addTrackingToDelivery(
    deliveryId: string,
    dto: CreateTrackingDto,
  ): Promise<TrackingEntity> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id: deliveryId },
    });

    if (!delivery) {
      throw new NotFoundException('Livraison non trouvée');
    }

    const tracking = this.trackingRepository.create({
      ...dto,
      delivery,
    });
    this.eventsGateway.notifyUser(
      delivery.order.user.id,
      'delivery.tracking.updated',
      {
        deliveryId,
        trackingStatus: dto.status,
      },
    );
    return this.trackingRepository.save(tracking);
  }

  async findAll(): Promise<DeliveryEntity[]> {
    return await this.deliveryRepository.find({
      relations: ['order', 'deliveryCompany', 'livreur', 'trackings'],
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async getTrackingsByDelivery(deliveryId: string): Promise<TrackingEntity[]> {
    const trackings = await this.trackingRepository.find({
      where: { delivery: { id: deliveryId } },
      order: { createdAt: 'ASC' }, // Historique du plus ancien au plus récent
    });

    if (!trackings.length) {
      throw new NotFoundException('Aucun tracking trouvé pour cette livraison');
    }

    return trackings;
  }

  async getTrackingByOrderId(orderId: string): Promise<TrackingEntity[]> {
    // On trouve d'abord la livraison liée à cette commande
    const delivery = await this.deliveryRepository.findOne({
      where: { order: { id: orderId } },
      relations: ['trackings'],
    });

    if (!delivery) {
      throw new NotFoundException(
        'Aucune livraison trouvée pour cette commande.',
      );
    }

    if (!delivery.trackings || delivery.trackings.length === 0) {
      throw new NotFoundException('Aucun tracking trouvé pour cette commande.');
    }

    // On trie par date croissante (du plus ancien au plus récent)
    const sortedTrackings = delivery.trackings.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    return sortedTrackings;
  }

  async findOne(id: string): Promise<DeliveryEntity> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id },
      relations: ['order', 'deliveryCompany', 'livreur', 'trackings'],
    });
    if (!delivery) throw new NotFoundException('Livraison non trouvée');
    return delivery;
  }

  async update(
    id: string,
    updateDeliveryDto: UpdateDeliveryDto,
  ): Promise<DeliveryEntity> {
    const delivery = await this.findOne(id);
    Object.assign(delivery, updateDeliveryDto);
    return this.deliveryRepository.save(delivery);
  }

  async remove(id: string): Promise<void> {
    const delivery = await this.findOne(id);
    await this.deliveryRepository.remove(delivery);
  }
}
