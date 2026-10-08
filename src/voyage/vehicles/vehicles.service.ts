/* eslint-disable prefer-const */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository, DataSource, In } from 'typeorm';
import { Vehicle } from './entities/vehicle.entity';
import { CompanyEntity } from '../../company/entities/company.entity';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { ResponseDto } from './dto/response.dto';
import { VehicleSchedule } from './entities/vehicle-schedule.entity';
import { CreateVehicleScheduleDto } from './dto/create-vehicle-schedule.dto';
import { UpdateVehicleScheduleDto } from './dto/update-vehicle-schedule.dto';
import { ScheduleStatus } from './enum/schedule-status.enum';
import { VehicleStatus } from './enum/vehicle-status.enum';
import { UserEntity } from 'src/users/entities/user.entity';
import { VehicleType } from './enum/vehicle-type.enum';
import { FilesService } from 'src/files/files.service';
import { VehicleSeat } from '../seats/entities/seat.entity';
import { UpdateVehicleStatusDto } from './dto/update-vehicle-status.dto';
import { I18nService } from 'src/libs/common/src';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
    @InjectRepository(CompanyEntity)
    private readonly companyRepository: Repository<CompanyEntity>,
    @InjectRepository(VehicleSchedule)
    private readonly scheduleRepository: Repository<VehicleSchedule>,
    private readonly dataSource: DataSource,
    private readonly filesService: FilesService,
    private readonly i18n: I18nService,
  ) { }

  // ==================== VEHICLES CRUD ====================

  async create(
    createVehicleDto: CreateVehicleDto,
    user: UserEntity,
    files?: Express.Multer.File[],
  ): Promise<ResponseDto<Vehicle>> {
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('vehicles.validation.no_active_company'),
      );
    }

    const company = await this.companyRepository.findOne({
      where: { id: user.activeCompanyId },
    });
    if (!company) {
      throw new NotFoundException(
        await this.i18n.translate('vehicles.validation.company_not_found', undefined, { id: user.activeCompanyId }),
      );
    }

    const existing = await this.vehicleRepository.findOne({
      where: { license_plate: createVehicleDto.licensePlate },
    });
    if (existing) {
      throw new ConflictException(
        await this.i18n.translate('vehicles.validation.license_plate_exists', undefined, { plate: createVehicleDto.licensePlate }),
      );
    }

    return await this.dataSource.transaction(async (manager) => {
      let imageUrls: string[] = [];
      if (files && files.length > 0) {
        for (const file of files) {
          const uploadedFile = await this.filesService.uploadFile(file, 'vehicles', 'vehicle');
          imageUrls.push(uploadedFile.data);
        }
      }

      const vehicle = manager.create(Vehicle, {
        company_id: user.activeCompanyId,
        license_plate: createVehicleDto.licensePlate,
        vehicle_type: createVehicleDto.vehicleType,
        brand: createVehicleDto.brand || '',
        model: createVehicleDto.model || '',
        max_baggage_weight_per_passenger: createVehicleDto.maxBaggageWeightPerPassenger || 0,
        total_seats: createVehicleDto.totalSeats,
        status: createVehicleDto.status || VehicleStatus.ACTIVE,
        images: imageUrls.length > 0 ? imageUrls : null,
      } as DeepPartial<Vehicle>);

      const savedVehicle = await manager.save(vehicle);

      const seatsToCreate: Partial<VehicleSeat>[] = [];
      const usedOrders = new Set<number>();

      if (createVehicleDto.seats && createVehicleDto.seats.length > 0) {
        const seatNumbers = createVehicleDto.seats.map(s => s.seatNumber);
        const existingSeats = await manager.find(VehicleSeat, {
          where: { vehicle_id: savedVehicle.id, seat_number: In(seatNumbers) },
        });
        if (existingSeats.length > 0) {
          const existingNumbers = existingSeats.map(s => s.seat_number).join(', ');
          throw new ConflictException(
            await this.i18n.translate('vehicles.validation.seats_already_exist', undefined, { numbers: existingNumbers }),
          );
        }

        for (const seatDto of createVehicleDto.seats) {
          let order = seatDto.order;
          if (order !== undefined) {
            if (usedOrders.has(order)) {
              throw new ConflictException(
                await this.i18n.translate('vehicles.validation.order_duplicate', undefined, { order }),
              );
            }
            const existingOrder = await manager.findOne(VehicleSeat, {
              where: { vehicle_id: savedVehicle.id, order },
            });
            if (existingOrder) {
              throw new ConflictException(
                await this.i18n.translate('vehicles.validation.order_already_used', undefined, { order }),
              );
            }
            usedOrders.add(order);
          } else {
            const maxExisting = (await manager.maximum(VehicleSeat, 'order', { vehicle_id: savedVehicle.id })) ?? 0;
            let maxUsed = 0;
            for (const o of usedOrders) if (o > maxUsed) maxUsed = o;
            order = Math.max(maxExisting, maxUsed) + 1;
            usedOrders.add(order);
          }
          seatsToCreate.push({
            vehicle_id: savedVehicle.id,
            seat_number: seatDto.seatNumber,
            seat_type: seatDto.seatType,
            order,
          });
        }
      } else {
        for (let i = 1; i <= savedVehicle.total_seats; i++) {
          let seatType = 'STANDARD';
          if (i <= 2) seatType = 'PREMIUM';
          else if (i === savedVehicle.total_seats) seatType = 'REAR';
          else if (i === Math.floor(savedVehicle.total_seats / 2)) seatType = 'NEAR_DOOR';
          seatsToCreate.push({
            vehicle_id: savedVehicle.id,
            seat_number: `S${i.toString().padStart(2, '0')}`,
            seat_type: seatType,
            order: i,
          });
        }
      }

      const createdSeats = await manager.save(VehicleSeat, seatsToCreate);

      const vehicleWithRelations = await manager.findOne(Vehicle, {
        where: { id: savedVehicle.id },
        relations: ['company', 'seats'],
      });

      this.logger.log(
        await this.i18n.translate('vehicles.log.create_success', undefined, { license: savedVehicle.license_plate, count: createdSeats.length }),
      );

      return new ResponseDto(
        await this.i18n.translate('vehicles.create_success'),
        vehicleWithRelations!,
      );
    });
  }

  async update(
    id: string,
    updateVehicleDto: UpdateVehicleDto,
    user: UserEntity,
    files?: Express.Multer.File[],
  ): Promise<ResponseDto<Vehicle>> {
    const vehicle = await this.vehicleRepository.findOne({
      where: { id },
      relations: ['company', 'seats'],
    });

    if (!vehicle) {
      throw new NotFoundException(
        await this.i18n.translate('vehicles.validation.vehicle_not_found', undefined, { id }),
      );
    }

    if (vehicle.company_id !== user.activeCompanyId) {
      throw new ForbiddenException(
        await this.i18n.translate('vehicles.validation.forbidden'),
      );
    }

    return await this.dataSource.transaction(async (manager) => {
      if (files && files.length > 0) {
        const currentImages = (vehicle.images as string[]) || [];
        const newImages: string[] = [...currentImages];
        for (const file of files) {
          const uploadedFile = await this.filesService.uploadFile(file, 'vehicles', 'vehicle');
          newImages.push(uploadedFile.data);
        }
        vehicle.images = newImages;
      }

      Object.assign(vehicle, {
        license_plate: updateVehicleDto.licensePlate ?? vehicle.license_plate,
        vehicle_type: updateVehicleDto.vehicleType ?? vehicle.vehicle_type,
        brand: updateVehicleDto.brand ?? vehicle.brand,
        model: updateVehicleDto.model ?? vehicle.model,
        total_seats: updateVehicleDto.totalSeats ?? vehicle.total_seats,
        max_baggage_weight_per_passenger:
          updateVehicleDto.maxBaggageWeightPerPassenger ?? vehicle.max_baggage_weight_per_passenger,
        status: updateVehicleDto.status ?? vehicle.status,
      });

      const updated = await manager.save(vehicle);

      if (vehicle.seats && vehicle.seats.length > 0) {
        await manager.delete(VehicleSeat, { vehicle_id: id });
      }

      const seatsToCreate: Partial<VehicleSeat>[] = [];
      const usedOrders = new Set<number>();

      if (updateVehicleDto.seats && updateVehicleDto.seats.length > 0) {
        for (const seatDto of updateVehicleDto.seats) {
          let order = seatDto.order;
          if (order !== undefined) {
            if (usedOrders.has(order)) {
              throw new ConflictException(
                await this.i18n.translate('vehicles.validation.order_duplicate', undefined, { order }),
              );
            }
            const existingOrder = await manager.findOne(VehicleSeat, {
              where: { vehicle_id: updated.id, order },
            });
            if (existingOrder) {
              throw new ConflictException(
                await this.i18n.translate('vehicles.validation.order_already_used', undefined, { order }),
              );
            }
            usedOrders.add(order);
          } else {
            const maxExisting = (await manager.maximum(VehicleSeat, 'order', { vehicle_id: updated.id })) ?? 0;
            let maxUsed = 0;
            for (const o of usedOrders) if (o > maxUsed) maxUsed = o;
            order = Math.max(maxExisting, maxUsed) + 1;
            usedOrders.add(order);
          }
          seatsToCreate.push({
            vehicle_id: updated.id,
            seat_number: seatDto.seatNumber,
            seat_type: seatDto.seatType,
            order,
          });
        }
      } else {
        for (let i = 1; i <= updated.total_seats; i++) {
          let seatType = 'STANDARD';
          if (i <= 2) seatType = 'PREMIUM';
          else if (i === updated.total_seats) seatType = 'REAR';
          else if (i === Math.floor(updated.total_seats / 2)) seatType = 'NEAR_DOOR';
          seatsToCreate.push({
            vehicle_id: updated.id,
            seat_number: `S${i.toString().padStart(2, '0')}`,
            seat_type: seatType,
            order: i,
          });
        }
      }

      const createdSeats = await manager.save(VehicleSeat, seatsToCreate);

      const vehicleWithRelations = await manager.findOne(Vehicle, {
        where: { id: updated.id },
        relations: ['company', 'seats'],
      });

      this.logger.log(
        await this.i18n.translate('vehicles.log.update_success', undefined, { license: vehicle.license_plate, count: createdSeats.length }),
      );

      return new ResponseDto(
        await this.i18n.translate('vehicles.update_success'),
        vehicleWithRelations!,
      );
    });
  }

  async findAll(
    user: UserEntity,
    page: number = 1,
    limit: number = 10,
    status?: VehicleStatus,
    vehicleType?: VehicleType,
  ): Promise<ResponseDto<{ data: Vehicle[]; total: number; page: number; limit: number }>> {
    const skip = (page - 1) * limit;

    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('vehicles.validation.no_active_company'),
      );
    }

    const queryBuilder = this.vehicleRepository
      .createQueryBuilder('vehicle')
      .leftJoinAndSelect('vehicle.company', 'company')
      .leftJoinAndSelect('vehicle.seats', 'seats')
      .leftJoinAndSelect('vehicle.schedules', 'schedules')
      .where('vehicle.company_id = :companyId', { companyId: user.activeCompanyId });

    if (status) queryBuilder.andWhere('vehicle.status = :status', { status });
    if (vehicleType) queryBuilder.andWhere('vehicle.vehicle_type = :vehicleType', { vehicleType });

    queryBuilder.orderBy('vehicle.created_at', 'DESC').skip(skip).take(limit);

    const [vehicles, total] = await queryBuilder.getManyAndCount();

    return new ResponseDto(
      await this.i18n.translate('vehicles.list_retrieved'),
      { data: vehicles, total, page, limit },
    );
  }

  async findOne(id: string): Promise<ResponseDto<Vehicle>> {
    const vehicle = await this.vehicleRepository.findOne({
      where: { id },
      relations: ['company', 'seats', 'schedules', 'trips'],
    });

    if (!vehicle) {
      throw new NotFoundException(
        await this.i18n.translate('vehicles.validation.vehicle_not_found', undefined, { id }),
      );
    }

    return new ResponseDto(
      await this.i18n.translate('vehicles.found'),
      vehicle,
    );
  }

  async updateStatus(
    id: string,
    updateStatusDto: UpdateVehicleStatusDto,
    user: UserEntity,
  ): Promise<ResponseDto<Vehicle>> {
    const vehicle = await this.vehicleRepository.findOne({
      where: { id },
      relations: ['company', 'seats'],
    });

    if (!vehicle) {
      throw new NotFoundException(
        await this.i18n.translate('vehicles.validation.vehicle_not_found', undefined, { id }),
      );
    }

    if (vehicle.company_id !== user.activeCompanyId) {
      throw new ForbiddenException(
        await this.i18n.translate('vehicles.validation.forbidden'),
      );
    }

    const oldStatus = vehicle.status;
    const newStatus = updateStatusDto.status;

    if (oldStatus === newStatus) {
      throw new BadRequestException(
        await this.i18n.translate('vehicles.validation.status_already', undefined, { status: newStatus }),
      );
    }

    vehicle.status = newStatus;
    const updated = await this.vehicleRepository.save(vehicle);

    this.logger.log(
      await this.i18n.translate('vehicles.log.status_change', undefined, { license: vehicle.license_plate, old: oldStatus, new: newStatus }),
    );

    const withRelations = await this.vehicleRepository.findOne({
      where: { id: updated.id },
      relations: ['company', 'seats'],
    });

    return new ResponseDto(
      await this.i18n.translate('vehicles.status_updated', undefined, { old: oldStatus, new: newStatus }),
      withRelations!,
    );
  }

  async remove(id: string, user: UserEntity): Promise<ResponseDto<null>> {
    const vehicle = await this.vehicleRepository.findOne({
      where: { id },
    });

    if (!vehicle) {
      throw new NotFoundException(
        await this.i18n.translate('vehicles.validation.vehicle_not_found', undefined, { id }),
      );
    }

    if (vehicle.company_id !== user.activeCompanyId) {
      throw new ForbiddenException(
        await this.i18n.translate('vehicles.validation.forbidden'),
      );
    }

    await this.vehicleRepository.remove(vehicle);

    this.logger.log(
      await this.i18n.translate('vehicles.log.delete_success', undefined, { license: vehicle.license_plate }),
    );

    return new ResponseDto(
      await this.i18n.translate('vehicles.delete_success'),
      null,
    );
  }

  // ==================== VEHICLE SCHEDULES ====================

  async createSchedule(
    createDto: CreateVehicleScheduleDto,
    user: UserEntity,
  ): Promise<ResponseDto<VehicleSchedule>> {
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('vehicles.validation.no_active_company'),
      );
    }

    const vehicle = await this.vehicleRepository.findOne({
      where: { id: createDto.vehicle_id, company_id: user.activeCompanyId },
    });

    if (!vehicle) {
      throw new NotFoundException(
        await this.i18n.translate('vehicles.validation.schedule_vehicle_not_found', undefined, { id: createDto.vehicle_id }),
      );
    }

    return await this.dataSource.transaction(async (manager) => {
      const schedule = manager.create(VehicleSchedule, {
        company_id: user.activeCompanyId,
        vehicle_id: createDto.vehicle_id,
        driver_name: createDto.driver_name,
        driver_phone: createDto.driver_phone || '',
        departure_city: createDto.departure_city,
        arrival_city: createDto.arrival_city,
        departure_datetime: new Date(createDto.departure_datetime),
        estimated_arrival_datetime: new Date(createDto.estimated_arrival_datetime),
        base_price: createDto.base_price,
        status: createDto.status || ScheduleStatus.SCHEDULED,
        recurrence: createDto.recurrence,
        recurrence_end_date: createDto.recurrence_end_date ? new Date(createDto.recurrence_end_date) : null,
        notes: createDto.notes || '',
      } as DeepPartial<VehicleSchedule>);

      const saved = await manager.save(schedule);
      const withRelations = await manager.findOne(VehicleSchedule, {
        where: { id: saved.id },
        relations: ['vehicle', 'company'],
      });

      this.logger.log(
        await this.i18n.translate('vehicles.log.schedule_create_success', undefined, { license: vehicle.license_plate }),
      );

      return new ResponseDto(
        await this.i18n.translate('vehicles.schedule_create_success'),
        withRelations!,
      );
    });
  }

  async findAllSchedules(
    companyId?: string,
    page: number = 1,
    limit: number = 10,
    status?: ScheduleStatus,
  ): Promise<ResponseDto<{ data: VehicleSchedule[]; total: number; page: number; limit: number }>> {
    const skip = (page - 1) * limit;

    const queryBuilder = this.scheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.vehicle', 'vehicle')
      .leftJoinAndSelect('schedule.company', 'company');

    if (companyId) queryBuilder.where('schedule.company_id = :companyId', { companyId });
    if (status) queryBuilder.andWhere('schedule.status = :status', { status });

    queryBuilder.orderBy('schedule.departure_datetime', 'ASC').skip(skip).take(limit);

    const [schedules, total] = await queryBuilder.getManyAndCount();

    return new ResponseDto(
      await this.i18n.translate('vehicles.schedule_list_retrieved'),
      { data: schedules, total, page, limit },
    );
  }

  async findOneSchedule(id: string): Promise<ResponseDto<VehicleSchedule>> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id },
      relations: ['vehicle', 'company'],
    });

    if (!schedule) {
      throw new NotFoundException(
        await this.i18n.translate('vehicles.validation.schedule_not_found', undefined, { id }),
      );
    }

    return new ResponseDto(
      await this.i18n.translate('vehicles.schedule_found'),
      schedule,
    );
  }

  async updateSchedule(
    id: string,
    updateDto: UpdateVehicleScheduleDto,
    user: UserEntity,
  ): Promise<ResponseDto<VehicleSchedule>> {
    const existing = await this.scheduleRepository.findOne({
      where: { id, company_id: user.activeCompanyId },
    });

    if (!existing) {
      throw new NotFoundException(
        await this.i18n.translate('vehicles.validation.schedule_not_found', undefined, { id }),
      );
    }

    return await this.dataSource.transaction(async (manager) => {
      const updatedData: any = {};
      if (updateDto.driver_name !== undefined) updatedData.driver_name = updateDto.driver_name;
      if (updateDto.driver_phone !== undefined) updatedData.driver_phone = updateDto.driver_phone;
      if (updateDto.departure_city !== undefined) updatedData.departure_city = updateDto.departure_city;
      if (updateDto.arrival_city !== undefined) updatedData.arrival_city = updateDto.arrival_city;
      if (updateDto.departure_datetime !== undefined) updatedData.departure_datetime = new Date(updateDto.departure_datetime);
      if (updateDto.estimated_arrival_datetime !== undefined) updatedData.estimated_arrival_datetime = new Date(updateDto.estimated_arrival_datetime);
      if (updateDto.base_price !== undefined) updatedData.base_price = updateDto.base_price;
      if (updateDto.status !== undefined) updatedData.status = updateDto.status;
      if (updateDto.recurrence !== undefined) updatedData.recurrence = updateDto.recurrence;
      if (updateDto.recurrence_end_date !== undefined) updatedData.recurrence_end_date = updateDto.recurrence_end_date ? new Date(updateDto.recurrence_end_date) : null;
      if (updateDto.notes !== undefined) updatedData.notes = updateDto.notes;

      await manager.update(VehicleSchedule, id, updatedData);
      const updated = await manager.findOne(VehicleSchedule, {
        where: { id },
        relations: ['vehicle', 'company'],
      });

      this.logger.log(
        await this.i18n.translate('vehicles.log.schedule_update_success', undefined, { id }),
      );

      return new ResponseDto(
        await this.i18n.translate('vehicles.schedule_update_success'),
        updated!,
      );
    });
  }

  async removeSchedule(id: string, user: UserEntity): Promise<ResponseDto<null>> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id, company_id: user.activeCompanyId },
    });

    if (!schedule) {
      throw new NotFoundException(
        await this.i18n.translate('vehicles.validation.schedule_not_found', undefined, { id }),
      );
    }

    await this.scheduleRepository.remove(schedule);
    this.logger.log(
      await this.i18n.translate('vehicles.log.schedule_delete_success', undefined, { id }),
    );

    return new ResponseDto(
      await this.i18n.translate('vehicles.schedule_delete_success'),
      null,
    );
  }

  // ==================== UTILITY METHODS ====================

  async updateVehicleImages(
    vehicleId: string,
    imageUrls: string[],
    user: UserEntity,
  ): Promise<ResponseDto<Vehicle>> {
    const vehicle = await this.vehicleRepository.findOne({
      where: { id: vehicleId, company_id: user.activeCompanyId },
    });

    if (!vehicle) {
      throw new NotFoundException(
        await this.i18n.translate('vehicles.validation.vehicle_not_found', undefined, { id: vehicleId }),
      );
    }

    vehicle.images = imageUrls;
    const updated = await this.vehicleRepository.save(vehicle);

    return new ResponseDto(
      await this.i18n.translate('vehicles.images_updated'),
      updated,
    );
  }

  async getAvailableVehicles(
    departureCity: string,
    arrivalCity: string,
    date: Date,
  ): Promise<ResponseDto<any[]>> {
    const schedules = await this.scheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.vehicle', 'vehicle')
      .leftJoinAndSelect('schedule.company', 'company')
      .where('schedule.departure_city = :departureCity', { departureCity })
      .andWhere('schedule.arrival_city = :arrivalCity', { arrivalCity })
      .andWhere('DATE(schedule.departure_datetime) = DATE(:date)', { date })
      .andWhere('schedule.status = :scheduleStatus', { scheduleStatus: ScheduleStatus.SCHEDULED })
      .andWhere('vehicle.status = :vehicleStatus', { vehicleStatus: VehicleStatus.ACTIVE })
      .getMany();

    const result = schedules.map((schedule) => ({
      vehicle: schedule.vehicle,
      schedule: {
        id: schedule.id,
        driver_name: schedule.driver_name,
        driver_phone: schedule.driver_phone,
        departure_city: schedule.departure_city,
        arrival_city: schedule.arrival_city,
        departure_datetime: schedule.departure_datetime,
        estimated_arrival_datetime: schedule.estimated_arrival_datetime,
        base_price: schedule.base_price,
        status: schedule.status,
        recurrence: schedule.recurrence,
        notes: schedule.notes,
      },
    }));

    return new ResponseDto(
      await this.i18n.translate('vehicles.available_vehicles_found'),
      result,
    );
  }
}