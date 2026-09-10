import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { VehicleSeat } from './entities/seat.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { CreateSeatDto, CreateManySeatsDto } from './dto/create-seat.dto';
import { UpdateSeatDto } from './dto/update-seat.dto';
import { SeatType } from './enums/seat-type.enum';

@Injectable()
export class SeatsService {
  constructor(
    @InjectRepository(VehicleSeat)
    private readonly seatRepository: Repository<VehicleSeat>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
  ) { }

  // ------------------- Méthode utilitaire -------------------
  private async assignOrder(
    vehicleId: string,
    requestedOrder?: number,
    excludeSeatId?: string,
  ): Promise<number> {
    if (requestedOrder !== undefined) {
      const query: any = { vehicle_id: vehicleId, order: requestedOrder };
      if (excludeSeatId) query.id = Not(excludeSeatId);
      const existing = await this.seatRepository.findOne({ where: query });
      if (existing) {
        throw new ConflictException(
          `L'ordre ${requestedOrder} est déjà utilisé par un autre siège de ce véhicule`,
        );
      }
      return requestedOrder;
    } else {
      const maxOrder = await this.seatRepository.maximum('order', { vehicle_id: vehicleId });
      return (maxOrder ?? 0) + 1;
    }
  }

  // ------------------- Création d'un seul siège -------------------
  async create(createDto: CreateSeatDto): Promise<VehicleSeat> {
    const vehicle = await this.vehicleRepository.findOne({
      where: { id: createDto.vehicleId },
    });
    if (!vehicle) {
      throw new NotFoundException(`Véhicule avec l'ID ${createDto.vehicleId} non trouvé`);
    }

    const existing = await this.seatRepository.findOne({
      where: {
        vehicle_id: createDto.vehicleId,
        seat_number: createDto.seatNumber,
      },
    });
    if (existing) {
      throw new ConflictException(`Le siège ${createDto.seatNumber} existe déjà pour ce véhicule`);
    }

    const order = await this.assignOrder(createDto.vehicleId, createDto.order);

    const seat = this.seatRepository.create({
      vehicle_id: createDto.vehicleId,
      seat_number: createDto.seatNumber,
      seat_type: createDto.seatType,
      order,
    });

    return this.seatRepository.save(seat);
  }

  // ------------------- Création multiple (user libre de mettre order) -------------------
  async createMany(createManyDto: CreateManySeatsDto): Promise<VehicleSeat[]> {
    const vehicle = await this.vehicleRepository.findOne({
      where: { id: createManyDto.vehicleId },
    });
    if (!vehicle) {
      throw new NotFoundException(`Véhicule avec l'ID ${createManyDto.vehicleId} non trouvé`);
    }

    const seatNumbers = createManyDto.seats.map(s => s.seatNumber);
    // Vérifier doublons de numéros de siège
    const existingSeats = await this.seatRepository.find({
      where: {
        vehicle_id: createManyDto.vehicleId,
        seat_number: In(seatNumbers),
      },
    });
    if (existingSeats.length > 0) {
      const existingNumbers = existingSeats.map(s => s.seat_number).join(', ');
      throw new ConflictException(`Les sièges suivants existent déjà: ${existingNumbers}`);
    }

    // Vérifier les conflits d'ordres (si fournis)
    const requestedOrders = createManyDto.seats
      .filter(s => s.order !== undefined)
      .map(s => s.order as number);
    if (requestedOrders.length > 0) {
      // Doublons internes dans la requête
      const uniqueOrders = new Set(requestedOrders);
      if (uniqueOrders.size !== requestedOrders.length) {
        throw new ConflictException(`Les ordres fournis ne doivent pas être dupliqués dans la même requête`);
      }
      // Conflits avec les sièges existants
      const conflictingOrders = await this.seatRepository.find({
        where: {
          vehicle_id: createManyDto.vehicleId,
          order: In(requestedOrders),
        },
      });
      if (conflictingOrders.length > 0) {
        const conflictOrderNumbers = conflictingOrders.map(o => o.order).join(', ');
        throw new ConflictException(`Les ordres suivants sont déjà utilisés: ${conflictOrderNumbers}`);
      }
    }

    const createdSeats: VehicleSeat[] = [];
    for (const seatDto of createManyDto.seats) {
      const order = await this.assignOrder(createManyDto.vehicleId, seatDto.order);
      const seat = this.seatRepository.create({
        vehicle_id: createManyDto.vehicleId,
        seat_number: seatDto.seatNumber,
        seat_type: seatDto.seatType,
        order,
      });
      createdSeats.push(await this.seatRepository.save(seat));
    }
    return createdSeats;
  }

  // ------------------- Génération automatique (order = i) -------------------
  async generateSeatsForVehicle(vehicleId: string, totalSeats: number): Promise<VehicleSeat[]> {
    const vehicle = await this.vehicleRepository.findOne({ where: { id: vehicleId } });
    if (!vehicle) {
      throw new NotFoundException(`Véhicule avec l'ID ${vehicleId} non trouvé`);
    }

    await this.seatRepository.delete({ vehicle_id: vehicleId });

    const seats: VehicleSeat[] = [];
    for (let i = 1; i <= totalSeats; i++) {
      let seatType = SeatType.STANDARD;
      if (i === 1) seatType = SeatType.NEAR_DOOR;
      if (i === totalSeats) seatType = SeatType.REAR;
      if (i % 5 === 0) seatType = SeatType.PREMIUM;

      const seat = this.seatRepository.create({
        vehicle_id: vehicleId,
        seat_number: i.toString(),
        seat_type: seatType,
        order: i,
      });
      seats.push(await this.seatRepository.save(seat));
    }
    return seats;
  }

  // ------------------- Lecture -------------------
  async findAllByVehicle(vehicleId: string): Promise<VehicleSeat[]> {
    const vehicle = await this.vehicleRepository.findOne({ where: { id: vehicleId } });
    if (!vehicle) {
      throw new NotFoundException(`Véhicule avec l'ID ${vehicleId} non trouvé`);
    }
    return this.seatRepository.find({
      where: { vehicle_id: vehicleId },
      order: { order: 'ASC' },
    });
  }

  async findAll(): Promise<VehicleSeat[]> {
    return this.seatRepository.find({
      relations: ['vehicle', 'reservationSeats'],
      order: { order: 'ASC' },
    });
  }

  async findOne(id: string): Promise<VehicleSeat> {
    const seat = await this.seatRepository.findOne({
      where: { id },
      relations: ['vehicle', 'reservationSeats'],
    });
    if (!seat) {
      throw new NotFoundException(`Siège avec l'ID ${id} non trouvé`);
    }
    return seat;
  }

  async findByVehicleAndSeatNumber(vehicleId: string, seatNumber: string): Promise<VehicleSeat> {
    const seat = await this.seatRepository.findOne({
      where: { vehicle_id: vehicleId, seat_number: seatNumber },
    });
    if (!seat) {
      throw new NotFoundException(`Siège ${seatNumber} non trouvé pour ce véhicule`);
    }
    return seat;
  }

  // ------------------- Mise à jour -------------------
  async update(id: string, updateDto: UpdateSeatDto): Promise<VehicleSeat> {
    const seat = await this.findOne(id);

    if (updateDto.seatNumber && updateDto.seatNumber !== seat.seat_number) {
      const existing = await this.seatRepository.findOne({
        where: {
          vehicle_id: seat.vehicle_id,
          seat_number: updateDto.seatNumber,
        },
      });
      if (existing) {
        throw new ConflictException(`Le siège ${updateDto.seatNumber} existe déjà pour ce véhicule`);
      }
      seat.seat_number = updateDto.seatNumber;
    }

    if (updateDto.seatType) {
      seat.seat_type = updateDto.seatType;
    }

    if (updateDto.order !== undefined && updateDto.order !== seat.order) {
      const order = await this.assignOrder(seat.vehicle_id, updateDto.order, id);
      seat.order = order;
    }

    return this.seatRepository.save(seat);
  }

  // ------------------- Suppression -------------------
  async remove(id: string): Promise<void> {
    const seat = await this.findOne(id);
    await this.seatRepository.remove(seat);
  }

  async removeAllByVehicle(vehicleId: string): Promise<void> {
    await this.seatRepository.delete({ vehicle_id: vehicleId });
  }

  async getAvailableSeats(vehicleId: string, reservationIds?: string[]): Promise<VehicleSeat[]> {
    const query = this.seatRepository
      .createQueryBuilder('seat')
      .leftJoinAndSelect('seat.reservationSeats', 'reservationSeat')
      .where('seat.vehicle_id = :vehicleId', { vehicleId });

    if (reservationIds && reservationIds.length > 0) {
      query.andWhere(
        'reservationSeat.reservationId NOT IN (:...reservationIds) OR reservationSeat.reservationId IS NULL',
        { reservationIds },
      );
    } else {
      query.andWhere('reservationSeat.id IS NULL');
    }

    return query.orderBy('seat.order', 'ASC').getMany();
  }
}