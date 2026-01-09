import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateShipmentTrackingDto } from './dto/create-shipment-tracking.dto';
import { UpdateShipmentTrackingDto } from './dto/update-shipment-tracking.dto';
import { Shipment } from './entity/shipment.entity';
import { ShipmentTracking } from './entity/shipment_tracking.entity';
import { TypeTransport } from './entity/type-transport.entity';

@Injectable()
export class ShipmentTrackingService {
  constructor(
    @InjectRepository(ShipmentTracking)
    private readonly trackingRepo: Repository<ShipmentTracking>,
    @InjectRepository(Shipment)
    private readonly shipmentRepo: Repository<Shipment>,
    @InjectRepository(TypeTransport)
    private readonly transportRepo: Repository<TypeTransport>,
  ) {}

  async create(dto: CreateShipmentTrackingDto) {
    const shipment = await this.shipmentRepo.findOne({ where: { id: dto.shipmentId } });
    if (!shipment) throw new NotFoundException('Shipment not found');

    const tracking = this.trackingRepo.create({
      shipment,
      status: dto.status,
      location: dto.location,
      comment: dto.comment,
    });

    const saved = await this.trackingRepo.save(tracking);
    return { message: 'Tracking created successfully', data: saved };
  }

  async findAll() {
    return this.trackingRepo
      .find({
        relations: ['shipment'],
        order: { createdAt: 'ASC' },
      })
      .then((data) => ({ message: 'Trackings retrieved successfully', data }));
  }

  async findOne(id: string) {
    const tracking = await this.trackingRepo.findOne({
      where: { id },
      relations: ['shipment'],
    });
    if (!tracking) throw new NotFoundException('Tracking not found');
    return { message: 'Tracking retrieved successfully', data: tracking };
  }

  async update(id: string, dto: UpdateShipmentTrackingDto) {
    const tracking = await this.findOne(id).then((res) => res.data);

    if (dto.status) tracking.status = dto.status;
    if (dto.location !== undefined) tracking.location = dto.location;
    if (dto.comment !== undefined) tracking.comment = dto.comment;

    const updated = await this.trackingRepo.save(tracking);
    return { message: 'Tracking updated successfully', data: updated };
  }

  async remove(id: string) {
    const tracking = await this.findOne(id).then((res) => res.data);
    await this.trackingRepo.remove(tracking);
    return { message: 'Tracking removed successfully', data: tracking };
  }

  async trackByNumber(trackingNumber: string) {
    const shipment = await this.shipmentRepo.findOne({
      where: { trackingNumber },
      relations: ['trackings'],
    });

    if (!shipment) throw new NotFoundException('Tracking number not found');

    return { message: 'Tracking retrieved successfully', data: shipment };
  }
}
