import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { CreatePackageDto } from './dto/create-package.dto';
import { TypeTransport } from './entity/type-transport.entity';
import { PackageDetails } from './entity/package-details.entity';
import { Shipment } from './entity/shipment.entity';
import { ShipmentStatus } from './enum/shipment.dto';
import { TrackingNumberUtil } from 'src/users/utility/helpers/tracking-number.util';
import { UserEntity } from 'src/users/entities/user.entity';
import { ShipmentPriceDto } from './dto/createShipmentPrice.dto';

@Injectable()
export class ShipmentService {
  constructor(
    @InjectRepository(Shipment)
    private shipmentRepo: Repository<Shipment>,

    @InjectRepository(PackageDetails)
    private packageRepo: Repository<PackageDetails>,

    @InjectRepository(TypeTransport)
    private transportRepo: Repository<TypeTransport>,
  ) {}

  async create(
    createShipmentDto: CreateShipmentDto,
    currentUser: UserEntity,
  ): Promise<{ message: string; data: Shipment }> {
    const {
      pickupEnabled = false,
      shippingEnabled = false,
      deliveryEnabled = false,
      pickupTransportTypeId,
      shippingTransportTypeId,
      deliveryTransportTypeId,
      status = ShipmentStatus.PENDING,
      pickupFrom,
      pickupTo,
      pickupContactName,
      pickupContactPhone,
      shippingFrom,
      shippingTo,
      deliveryFrom,
      deliveryTo,
      deliveryContactName,
      deliveryContactPhone,

      description,
      external_quantity,
      weight,
      length,
      dimensions,
      internal_quantity,
      value,
      fragile,
    } = createShipmentDto;

    const validationErrors = this.validateShipmentSections(createShipmentDto);
    if (validationErrors.length > 0) {
      throw new BadRequestException(validationErrors);
    }

    const trackingNumber = TrackingNumberUtil.generate();
    const shipment = new Shipment();

    shipment.trackingNumber = trackingNumber;
    shipment.userId = currentUser.id;
    shipment.status = status;
    shipment.pickupEnabled = pickupEnabled;
    shipment.shippingEnabled = shippingEnabled;
    shipment.deliveryEnabled = deliveryEnabled;

    if (pickupEnabled) {
      if (pickupFrom) shipment.pickupFrom = pickupFrom;
      if (pickupTo) shipment.pickupTo = pickupTo;
      if (pickupContactName) shipment.pickupContactName = pickupContactName;
      if (pickupContactPhone) shipment.pickupContactPhone = pickupContactPhone;

      if (pickupTransportTypeId) {
        const pickupTransport = await this.transportRepo.findOne({
          where: { id: pickupTransportTypeId },
        });
        if (!pickupTransport)
          throw new NotFoundException(
            `Transport type avec ID ${pickupTransportTypeId} non trouvé`,
          );
        shipment.pickupTransportType = pickupTransport;
      }
    }

    if (shippingEnabled) {
      if (shippingFrom) shipment.shippingFrom = shippingFrom;
      if (shippingTo) shipment.shippingTo = shippingTo;

      if (shippingTransportTypeId) {
        const shippingTransport = await this.transportRepo.findOne({
          where: { id: shippingTransportTypeId },
        });
        if (!shippingTransport)
          throw new NotFoundException(
            `Transport type avec ID ${shippingTransportTypeId} non trouvé`,
          );
        shipment.shippingTransportType = shippingTransport;
      }
    }

    if (deliveryEnabled) {
      if (deliveryFrom) shipment.deliveryFrom = deliveryFrom;
      if (deliveryTo) shipment.deliveryTo = deliveryTo;
      if (deliveryContactName) shipment.deliveryContactName = deliveryContactName;
      if (deliveryContactPhone) shipment.deliveryContactPhone = deliveryContactPhone;

      if (deliveryTransportTypeId) {
        const deliveryTransport = await this.transportRepo.findOne({
          where: { id: deliveryTransportTypeId },
        });
        if (!deliveryTransport)
          throw new NotFoundException(
            `Transport type avec ID ${deliveryTransportTypeId} non trouvé`,
          );
        shipment.deliveryTransportType = deliveryTransport;
      }
    }

    const savedShipment = await this.shipmentRepo.save(shipment);

    if (!description || external_quantity === undefined) {
      throw new BadRequestException(
        'description et external_quantity sont obligatoires pour le package',
      );
    }

    const packageEntity = this.packageRepo.create({
      description,
      external_quantity,
      weight,
      length,
      dimensions,
      internal_quantity,
      value,
      fragile: fragile ?? false,
      shipment: { id: savedShipment.id } as any,
    });

    await this.packageRepo.save(packageEntity);

    const relations = [
      'package',
      pickupEnabled ? 'pickupTransportType' : null,
      shippingEnabled ? 'shippingTransportType' : null,
      deliveryEnabled ? 'deliveryTransportType' : null,
    ].filter(Boolean) as string[];

    const shipmentWithRelations = await this.shipmentRepo.findOneOrFail({
      where: { id: savedShipment.id },
      relations,
    });

    return {
      message: 'Colis créé avec succès',
      data: shipmentWithRelations,
    };
  }
  async updateShipmentPrices(
    shipmentId: string,
    priceDto: ShipmentPriceDto,
  ): Promise<{ message: string; data: Shipment }> {
    const shipment = await this.shipmentRepo.findOne({ where: { id: shipmentId } });

    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    if (priceDto.pickupPrice !== undefined) shipment.pickupPrice = priceDto.pickupPrice;
    if (priceDto.shippingPrice !== undefined) shipment.shippingPrice = priceDto.shippingPrice;
    if (priceDto.deliveryPrice !== undefined) shipment.deliveryPrice = priceDto.deliveryPrice;

    shipment.totalPrice = [
      shipment.pickupPrice || 0,
      shipment.shippingPrice || 0,
      shipment.deliveryPrice || 0,
    ].reduce((a, b) => a + b, 0);

    const savedShipment = await this.shipmentRepo.save(shipment);

    return {
      message: 'Prices updated successfully',
      data: savedShipment,
    };
  }

  private validateShipmentSections(dto: CreateShipmentDto): string[] {
    const errors: string[] = [];

    const isAnySectionEnabled = dto.pickupEnabled || dto.shippingEnabled || dto.deliveryEnabled;
    if (!isAnySectionEnabled) {
      errors.push(
        'Au moins une section doit être activée (pickupEnabled, shippingEnabled ou deliveryEnabled)',
      );
    }

    if (dto.pickupEnabled) {
      const requiredPickupFields = [
        'pickupFrom',
        'pickupTo',
        'pickupContactName',
        'pickupContactPhone',
        'pickupTransportTypeId',
      ] as const;

      requiredPickupFields.forEach((field) => {
        if (!dto[field] || dto[field].toString().trim() === '') {
          errors.push(`${field} est requis quand pickupEnabled est true`);
        }
      });
    }

    if (dto.shippingEnabled) {
      const requiredShippingFields = [
        'shippingFrom',
        'shippingTo',
        'shippingTransportTypeId',
      ] as const;

      requiredShippingFields.forEach((field) => {
        if (!dto[field] || dto[field].toString().trim() === '') {
          errors.push(`${field} est requis quand shippingEnabled est true`);
        }
      });
    }

    if (dto.deliveryEnabled) {
      const requiredDeliveryFields = [
        'deliveryFrom',
        'deliveryTo',
        'deliveryContactName',
        'deliveryContactPhone',
        'deliveryTransportTypeId',
      ] as const;

      requiredDeliveryFields.forEach((field) => {
        if (!dto[field] || dto[field].toString().trim() === '') {
          errors.push(`${field} est requis quand deliveryEnabled est true`);
        }
      });
    }

    return errors;
  }
  async findAll(): Promise<Shipment[]> {
    return this.shipmentRepo.find({
      relations: [
        'package',
        'pickupTransportType',
        'shippingTransportType',
        'deliveryTransportType',
      ],
    });
  }

  async findAllByUser(userId: string): Promise<Shipment[]> {
    return this.shipmentRepo.find({
      where: { userId },
      relations: [
        'package',
        'pickupTransportType',
        'shippingTransportType',
        'deliveryTransportType',
      ],
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<Shipment> {
    const shipment = await this.shipmentRepo.findOne({
      where: { id },
      relations: [
        'package',
        'pickupTransportType',
        'shippingTransportType',
        'deliveryTransportType',
      ],
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  async update(id: string, updateShipmentDto: UpdateShipmentDto): Promise<Shipment> {
    const shipment = await this.findOne(id);
    Object.assign(shipment, updateShipmentDto);

    if (updateShipmentDto.pickupTransportTypeId) {
      const pickupTransport = await this.transportRepo.findOne({
        where: { id: updateShipmentDto.pickupTransportTypeId },
      });
      if (pickupTransport) shipment.pickupTransportType = pickupTransport;
    }

    if (updateShipmentDto.shippingTransportTypeId) {
      const shippingTransport = await this.transportRepo.findOne({
        where: { id: updateShipmentDto.shippingTransportTypeId },
      });
      if (shippingTransport) shipment.shippingTransportType = shippingTransport;
    }

    if (updateShipmentDto.deliveryTransportTypeId) {
      const deliveryTransport = await this.transportRepo.findOne({
        where: { id: updateShipmentDto.deliveryTransportTypeId },
      });
      if (deliveryTransport) shipment.deliveryTransportType = deliveryTransport;
    }

    await this.shipmentRepo.save(shipment);
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const shipment = await this.findOne(id);
    await this.shipmentRepo.remove(shipment);
    return { message: 'Shipment removed successfully' };
  }
}
