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
import { plainToInstance } from 'class-transformer';

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
    const { invoiceNumber, livreurId, estimatedDeliveryTime } = createDeliveryDto;

    let order: OrderEntity | null = null;

    // 1. Vérifier la commande uniquement si invoiceNumber est fourni
    if (invoiceNumber) {
      order = await this.orderRepository.findOne({
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
    }

    // 3. Trouver le livreur
    const livreur = await this.userRepository.findOne({ where: { id: livreurId } });
    if (!livreur) {
      throw new NotFoundException('Livreur non trouvé.');
    }

    // 4. Créer la livraison avec order nullable
    const delivery = this.deliveryRepository.create({
      order: order ?? null,
      livreur,
      status: DeliveryStatus.IN_TRANSIT,
      estimatedDeliveryTime,
    });
    await this.deliveryRepository.save(delivery);

    // 5. Créer le suivi initial
    const tracking = this.trackingRepository.create({
      status: DeliveryStatus.IN_TRANSIT,
      location: 'Inconnue',
      notes: order
        ? 'Livraison en cours de traitement pour une commande existante.'
        : 'Livraison enregistrée sans commande associée.',
      delivery,
    });
    await this.trackingRepository.save(tracking);

    // 6. Recharger la livraison avec relations
    const fullDelivery = await this.deliveryRepository.findOne({
      where: { id: delivery.id },
      relations: ['order', 'livreur'],
    });

    if (!fullDelivery) {
      throw new NotFoundException("La livraison n'a pas pu être retrouvée après sa création.");
    }

    // ⚡ Supprimer le password du livreur
    if (fullDelivery.livreur) {
      const { password, ...livreurSansPassword } = fullDelivery.livreur;
      (fullDelivery as any).livreur = livreurSansPassword;
    }

    return {
      message: order
        ? 'Livraison créée avec succès pour la commande.'
        : 'Livraison créée avec succès (sans commande associée).',
      data: fullDelivery,
    };
  }

  async findAll(): Promise<{ data: any[] }> {
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
        'livreur',
      ],
      order: { createdAt: 'DESC' },
    });

    const sanitizedDeliveries = deliveries.map((delivery) => {
      if (delivery.livreur) {
        const { password, ...livreurSansPassword } = delivery.livreur;
        return { ...delivery, livreur: livreurSansPassword };
      }
      return delivery;
    });

    return { data: sanitizedDeliveries };
  }

  async findAllForUser(user: UserEntity): Promise<{ data: any[] }> {
    const deliveries = await this.deliveryRepository.find({
      where: { order: { user: { id: user.id } } },
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
        'livreur',
      ],
      order: { createdAt: 'DESC' },
    });

    const sanitizedDeliveries = deliveries.map((delivery) => {
      const { password, ...livreurSansPassword } = delivery.livreur || {};
      const orderUser = delivery.order?.user
        ? { ...delivery.order.user, password: undefined }
        : null;

      return {
        ...delivery,
        livreur: livreurSansPassword,
        order: delivery.order ? { ...delivery.order, user: orderUser } : null,
      };
    });

    return { data: sanitizedDeliveries };
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

  async confirmDeliveryByPin(pin: string): Promise<{ message: string; data: DeliveryEntity }> {
    if (!pin || pin.length !== 6) {
      throw new BadRequestException('PIN invalide.');
    }

    const order = await this.orderRepository.findOne({
      where: { pin },
      relations: ['delivery'], // 🔹 charge juste la livraison
    });

    if (!order) {
      throw new NotFoundException('Aucun ordre trouvé pour ce PIN.');
    }

    if (!order.delivery) {
      throw new NotFoundException("La livraison pour cet ordre n'a pas encore été créée.");
    }

    const delivery = order.delivery;

    if (!delivery) {
      throw new NotFoundException('Livraison introuvable.');
    }

    if (delivery.status === DeliveryStatus.DELIVERED) {
      throw new BadRequestException('La livraison a déjà été confirmée.');
    }

    // 🔹 Mettre à jour le statut et la date
    delivery.status = DeliveryStatus.DELIVERED;
    delivery.deliveredAt = new Date();
    const updatedDelivery = await this.deliveryRepository.save(delivery);

    // 🔹 Réinitialiser le PIN et mettre à jour le statut de l'ordre
    order.pin = '';
    order.status = OrderStatus.DELIVERED;
    await this.orderRepository.save(order);

    return {
      message: 'Livraison confirmée avec succès.',
      data: updatedDelivery,
    };
  }
}
