import {
  BadRequestException,
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
import { OrderStatus } from 'src/order/enum/order.status.enum';

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
    const { invoiceNumber, deliveryCompanyId, livreurId, estimatedDeliveryTime } =
      createDeliveryDto;

    // 1. Vérifier que la commande existe
    const order = await this.orderRepository.findOne({
      where: { invoiceNumber },
      relations: ['subOrders', 'subOrders.items', 'user'],
    });
    if (!order) {
      throw new NotFoundException('Commande de livraison non trouvée.');
    }

    // 2. Vérifier si une livraison existe déjà pour cette commande
    const existingDelivery = await this.deliveryRepository.findOne({
      where: { order: { id: order.id } },
    });
    if (existingDelivery) {
      throw new ConflictException('Une livraison existe déjà pour cette commande.');
    }

    // 3. Trouver l’entreprise de livraison
    const deliveryCompany = await this.companyRepository.findOne({
      where: { id: deliveryCompanyId },
    });
    if (!deliveryCompany) {
      throw new NotFoundException('Entreprise de livraison non trouvée.');
    }

    // 4. Trouver le livreur
    const livreur = await this.userRepository.findOne({
      where: { id: livreurId },
    });
    if (!livreur) {
      throw new NotFoundException('Livreur non trouvé.');
    }

    // 5. Créer la livraison
    const delivery = this.deliveryRepository.create({
      deliveryCompany,
      order,
      livreur,
      currentStatus: DeliveryStatus.IN_TRANSIT,
      estimatedDeliveryTime,
    });
    await this.deliveryRepository.save(delivery);

    // 6. Créer le suivi initial
    const tracking = this.trackingRepository.create({
      status: DeliveryStatus.IN_TRANSIT,
      location: 'Inconnue',
      notes: 'Livraison en cours de traitement',
      delivery,
    });
    await this.trackingRepository.save(tracking);

    // 7. Recharger la livraison avec toutes ses relations
    const fullDelivery = await this.deliveryRepository.findOne({
      where: { id: delivery.id },
      relations: ['order', 'deliveryCompany', 'livreur', 'trackings'],
    });

    if (!fullDelivery) {
      throw new NotFoundException("La livraison n'a pas pu être retrouvée après sa création.");
    }

    return {
      message: 'Livraison créée avec succès',
      data: fullDelivery,
    };
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
    this.eventsGateway.notifyUser(delivery.order.user.id, 'delivery.tracking.updated', {
      deliveryId,
      trackingStatus: dto.status,
    });
    return this.trackingRepository.save(tracking);
  }

  async findAll(): Promise<{ data: DeliveryEntity[] }> {
    const deliveries = await this.deliveryRepository.find({
      relations: [
        'order',
        'order.orderItems',
        'order.orderItems.product',
        'order.orderItems.product.company',
        'order.orderItems.product.category',
        'order.orderItems.product.measure',
        'order.subOrders',
        'order.subOrders.company',
        'order.subOrders.items',
        'order.subOrders.items.product',
        'order.subOrders.items.product.company',
        'order.subOrders.items.product.category',
        'order.subOrders.items.product.measure',
        'order.user',
        'order.addressUser',
        'deliveryCompany',
        'livreur',
        'trackings',
      ],
      order: {
        createdAt: 'DESC',
      },
    });

    return { data: deliveries };
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
      throw new NotFoundException('Aucune livraison trouvée pour cette commande.');
    }

    if (!delivery.trackings || delivery.trackings.length === 0) {
      throw new NotFoundException('Aucun tracking trouvé pour cette commande.');
    }

    // On trie par date croissante (du plus ancien au plus récent)
    const sortedTrackings = delivery.trackings.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
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

  async update(id: string, updateDeliveryDto: UpdateDeliveryDto): Promise<DeliveryEntity> {
    const delivery = await this.findOne(id);
    Object.assign(delivery, updateDeliveryDto);
    return this.deliveryRepository.save(delivery);
  }

  async remove(id: string): Promise<void> {
    const delivery = await this.findOne(id);
    await this.deliveryRepository.remove(delivery);
  }

  async confirmDeliveryByPin(pin: string): Promise<{ message: string; data: DeliveryEntity }> {
    // 1. Chercher la commande correspondant au PIN
    const order = await this.orderRepository.findOne({
      where: { pin },
      relations: ['delivery', 'delivery.livreur', 'delivery.trackings'],
    });

    if (!order || !order.delivery) {
      throw new NotFoundException('Aucune livraison trouvée pour ce PIN.');
    }

    const delivery = order.delivery;

    // 2. Vérifier que la livraison n'a pas déjà été effectuée
    if (delivery.currentStatus === DeliveryStatus.DELIVERED) {
      throw new BadRequestException('La livraison a déjà été confirmée.');
    }

    // 3. Mettre à jour la livraison
    delivery.currentStatus = DeliveryStatus.DELIVERED;
    delivery.deliveredAt = new Date();

    const updatedDelivery = await this.deliveryRepository.save(delivery);

    // 4. Ajouter un suivi final
    const tracking = this.trackingRepository.create({
      status: DeliveryStatus.DELIVERED,
      location: 'Livraison terminée',
      notes: 'Livraison confirmée par le client via PIN',
      delivery: updatedDelivery,
    });
    await this.trackingRepository.save(tracking);

    // 5. Réinitialiser le PIN pour sécurité
    order.pin = '';
    order.status = OrderStatus.DELIVERED;
    await this.orderRepository.save(order);

    return {
      message: 'Livraison confirmée avec succès.',
      data: updatedDelivery,
    };
  }
}
