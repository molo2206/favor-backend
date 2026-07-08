/* eslint-disable prefer-const */
// trips.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  Not,
  MoreThanOrEqual,
  LessThanOrEqual,
  In,
} from 'typeorm';
import { Trip } from './entities/trip.entity';
import { TripSegment } from './entities/trip-segment.entity';
import { VehicleSchedule } from '../vehicles/entities/vehicle-schedule.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { VehicleSeat } from '../seats/entities/seat.entity';
import { ReservationVehicule } from '../reservations-vehicles/entities/reservations-vehicle.entity';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { ScheduleStatus } from '../vehicles/enum/schedule-status.enum';
import { ReservationStatus } from '../reservations-vehicles/enum/reservation-status.enum';
import { DataSource } from 'typeorm';
import { ReservationSegment } from '../reservations-vehicles/entities/reservation-segment.entity';
import { PushNotificationHelper } from 'src/users/utility/helpers/push-notification.helper';
import { PermissionHelper } from 'src/users/utility/helpers/permission.helper';
import { NotificationsService } from 'src/notification/notifications.service';
import { NotificationHelper } from 'src/notification/utils/notification.helper';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { MailOrderService } from 'src/email/emailorder.service';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import { NotificationType } from 'src/notification/type/notification.type';
import { Meal } from '../meal/entity/meal.entity';
import { VehicleBaggageRule } from '../baggage-rules/entities/baggage-rule.entity';
import { I18nService } from 'src/libs/common/src';

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(TripSegment)
    private readonly tripSegmentRepository: Repository<TripSegment>,
    @InjectRepository(VehicleSchedule)
    private readonly scheduleRepository: Repository<VehicleSchedule>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
    @InjectRepository(VehicleSeat)
    private readonly seatRepository: Repository<VehicleSeat>,
    @InjectRepository(ReservationVehicule)
    private readonly reservationRepository: Repository<ReservationVehicule>,
    @InjectRepository(ReservationSegment)
    private readonly reservationSegmentRepository: Repository<ReservationSegment>,

    private readonly dataSource: DataSource,

    private readonly pushNotificationHelper: PushNotificationHelper,

    private readonly permissionHelper: PermissionHelper,

    private readonly notificationsService: NotificationsService,
    private readonly notificationHelper: NotificationHelper,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,

    @InjectRepository(UserHasCompanyEntity)
    private readonly userHasCompanyRepo: Repository<UserHasCompanyEntity>,

    private readonly mailOrderService: MailOrderService,

    private readonly smsHelper: SmsHelper,

    @InjectRepository(Meal)
    private readonly mealRepository: Repository<Meal>,

    @InjectRepository(VehicleBaggageRule)
    private readonly baggageRuleRepository: Repository<VehicleBaggageRule>,

    private readonly i18n: I18nService,
  ) { }

  // ==================== CREATE ====================

  async createTrip(createDto: CreateTripDto, companyId: string): Promise<Trip> {
    const hasSegments = createDto.segments && createDto.segments.length > 0;

    if (hasSegments) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const trip = new Trip();
        trip.company_id = companyId;
        trip.departure_datetime = new Date(createDto.departure_datetime);
        trip.status = createDto.status || ScheduleStatus.SCHEDULED;
        const savedTrip = await queryRunner.manager.save(trip);

        let previousArrival: Date | null = null;

        if (createDto.segments) {
          for (const segDto of createDto.segments) {
            if (!segDto.vehicle_id) {
              throw new BadRequestException(
                await this.i18n.translate('trips.validation.vehicle_required_segment', undefined, { order: segDto.segment_order }),
              );
            }

            const vehicle = await this.vehicleRepository.findOne({
              where: { id: segDto.vehicle_id, company_id: companyId },
            });
            if (!vehicle) {
              throw new BadRequestException(
                await this.i18n.translate('trips.validation.vehicle_not_found', undefined, { vehicleId: segDto.vehicle_id }),
              );
            }

            const depDate = new Date(segDto.departure_datetime);
            const arrDate = new Date(segDto.estimated_arrival_datetime);

            if (previousArrival && depDate < previousArrival) {
              throw new BadRequestException(
                await this.i18n.translate('trips.validation.departure_before_previous_arrival', undefined, { order: segDto.segment_order }),
              );
            }

            await this.checkVehicleAvailability(segDto.vehicle_id, depDate);

            const segment = new TripSegment();
            segment.trip_id = savedTrip.id;
            segment.segment_order = segDto.segment_order;
            segment.vehicle_id = segDto.vehicle_id;
            segment.departure_city = segDto.departure_city;
            segment.arrival_city = segDto.arrival_city;
            segment.departure_datetime = depDate;
            segment.estimated_arrival_datetime = arrDate;
            segment.distance_km = segDto.distance_km ?? 0;
            segment.estimated_duration_minutes = segDto.estimated_duration_minutes ?? 0;
            segment.segment_price = segDto.segment_price ?? 0;
            segment.status = ScheduleStatus.SCHEDULED;

            await queryRunner.manager.save(segment);
            previousArrival = arrDate;
          }
        }

        await queryRunner.commitTransaction();

        if (createDto.meals && createDto.meals.length > 0) {
          const mealsToCreate = createDto.meals.map(mealDto => {
            const meal = new Meal();
            meal.name = mealDto.name;
            if (mealDto.description !== undefined) meal.description = mealDto.description;
            meal.price = mealDto.price;
            meal.isAvailable = mealDto.isAvailable ?? true;
            meal.companyId = companyId;
            meal.tripId = savedTrip.id;
            return meal;
          });
          await this.mealRepository.save(mealsToCreate);
        }

        return this.findOneWithSegments(savedTrip.id);
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    } else {
      if (!createDto.schedule_id) {
        throw new BadRequestException(
          await this.i18n.translate('trips.validation.schedule_id_required'),
        );
      }
      if (!createDto.vehicle_id) {
        throw new BadRequestException(
          await this.i18n.translate('trips.validation.vehicle_id_required'),
        );
      }

      const schedule = await this.scheduleRepository.findOne({
        where: { id: createDto.schedule_id },
      });
      if (!schedule) {
        throw new NotFoundException(
          await this.i18n.translate('trips.validation.schedule_not_found', undefined, { id: createDto.schedule_id }),
        );
      }

      const vehicle = await this.vehicleRepository.findOne({
        where: { id: createDto.vehicle_id },
      });
      if (!vehicle) {
        throw new NotFoundException(
          await this.i18n.translate('trips.validation.vehicle_not_found_by_id', undefined, { id: createDto.vehicle_id }),
        );
      }

      if (vehicle.company_id !== companyId) {
        throw new ForbiddenException(
          await this.i18n.translate('trips.validation.vehicle_not_belong'),
        );
      }

      const departureDate = new Date(createDto.departure_datetime);
      await this.checkVehicleAvailability(createDto.vehicle_id, departureDate);

      const trip = new Trip();
      trip.schedule_id = createDto.schedule_id;
      trip.vehicle_id = createDto.vehicle_id;
      trip.company_id = companyId;
      trip.departure_datetime = departureDate;
      trip.status = createDto.status || ScheduleStatus.SCHEDULED;

      if (createDto.actual_departure_datetime) {
        trip.actual_departure_datetime = new Date(createDto.actual_departure_datetime);
      }
      if (createDto.actual_arrival_datetime) {
        trip.actual_arrival_datetime = new Date(createDto.actual_arrival_datetime);
      }

      const savedTrip = await this.tripRepository.save(trip);

      if (createDto.meals && createDto.meals.length > 0) {
        const mealsToCreate = createDto.meals.map(mealDto => {
          const meal = new Meal();
          meal.name = mealDto.name;
          if (mealDto.description !== undefined) meal.description = mealDto.description;
          meal.price = mealDto.price;
          meal.isAvailable = mealDto.isAvailable ?? true;
          meal.companyId = companyId;
          meal.tripId = savedTrip.id;
          return meal;
        });
        await this.mealRepository.save(mealsToCreate);
      }

      return savedTrip;
    }
  }

  async update(
    id: string,
    updateDto: UpdateTripDto,
    companyId: string,
  ): Promise<Trip> {
    const trip = await this.findOneWithSegments(id);

    if (trip.company_id !== companyId) {
      throw new ForbiddenException(
        await this.i18n.translate('trips.update.forbidden'),
      );
    }

    if (updateDto.schedule_id) {
      const schedule = await this.scheduleRepository.findOne({
        where: { id: updateDto.schedule_id },
      });
      if (!schedule) {
        throw new NotFoundException(
          await this.i18n.translate('trips.validation.schedule_not_found', undefined, { id: updateDto.schedule_id }),
        );
      }
      trip.schedule_id = updateDto.schedule_id;
    }

    if (updateDto.vehicle_id) {
      const vehicle = await this.vehicleRepository.findOne({
        where: { id: updateDto.vehicle_id },
      });
      if (!vehicle) {
        throw new NotFoundException(
          await this.i18n.translate('trips.validation.vehicle_not_found_by_id', undefined, { id: updateDto.vehicle_id }),
        );
      }
      if (vehicle.company_id !== companyId) {
        throw new ForbiddenException(
          await this.i18n.translate('trips.update.vehicle_not_belong'),
        );
      }
      trip.vehicle_id = updateDto.vehicle_id;
    }

    if (updateDto.departure_datetime) {
      const newDepartureDate = new Date(updateDto.departure_datetime);
      if (trip.vehicle_id) {
        await this.checkVehicleAvailability(trip.vehicle_id, newDepartureDate, id);
      }
      trip.departure_datetime = newDepartureDate;
    }

    if (updateDto.actual_departure_datetime) {
      trip.actual_departure_datetime = new Date(updateDto.actual_departure_datetime);
    }
    if (updateDto.actual_arrival_datetime) {
      trip.actual_arrival_datetime = new Date(updateDto.actual_arrival_datetime);
    }
    if (updateDto.status) {
      trip.status = updateDto.status;
    }

    await this.tripRepository.save(trip);

    const existingSegments = await this.tripSegmentRepository.find({
      where: { trip_id: id },
    });

    for (const segment of existingSegments) {
      const hasReservations = await this.reservationSegmentRepository.count({
        where: { segment_id: segment.id },
      });
      if (hasReservations > 0) {
        throw new BadRequestException(
          await this.i18n.translate('trips.update.cannot_delete_segment', undefined, { order: segment.segment_order }),
        );
      }
      await this.tripSegmentRepository.delete(segment.id);
    }

    if (updateDto.segments && updateDto.segments.length > 0) {
      for (let i = 0; i < updateDto.segments.length; i++) {
        const segDto = updateDto.segments[i];
        const segmentOrder = segDto.segment_order || i + 1;

        if (
          !segDto.vehicle_id ||
          !segDto.departure_city ||
          !segDto.arrival_city ||
          !segDto.departure_datetime ||
          !segDto.estimated_arrival_datetime
        ) {
          throw new BadRequestException(
            await this.i18n.translate('trips.validation.segment_fields_required'),
          );
        }

        const vehicle = await this.vehicleRepository.findOne({
          where: { id: segDto.vehicle_id, company_id: companyId },
        });
        if (!vehicle) {
          throw new BadRequestException(
            await this.i18n.translate('trips.validation.vehicle_not_found', undefined, { vehicleId: segDto.vehicle_id }),
          );
        }

        const depDate = new Date(segDto.departure_datetime);
        const arrDate = new Date(segDto.estimated_arrival_datetime);

        if (depDate >= arrDate) {
          throw new BadRequestException(
            await this.i18n.translate('trips.validation.departure_before_arrival', undefined, { order: segmentOrder }),
          );
        }

        await this.checkVehicleAvailability(segDto.vehicle_id, depDate);

        const newSegment = this.tripSegmentRepository.create({
          trip_id: id,
          segment_order: segmentOrder,
          vehicle_id: segDto.vehicle_id,
          departure_city: segDto.departure_city,
          arrival_city: segDto.arrival_city,
          departure_datetime: depDate,
          estimated_arrival_datetime: arrDate,
          distance_km: segDto.distance_km ?? 0,
          estimated_duration_minutes: segDto.estimated_duration_minutes ?? 0,
          segment_price: segDto.segment_price ?? 0,
          status: segDto.status || ScheduleStatus.SCHEDULED,
        });

        await this.tripSegmentRepository.save(newSegment);
      }
    }

    await this.mealRepository.createQueryBuilder()
      .delete()
      .where('trip_id = :tripId', { tripId: id })
      .execute();

    if (updateDto.meals && updateDto.meals.length > 0) {
      const mealsToCreate = updateDto.meals.map(mealDto => {
        const meal = new Meal();
        meal.name = mealDto.name;
        if (mealDto.description !== undefined) meal.description = mealDto.description;
        meal.price = mealDto.price;
        meal.isAvailable = mealDto.isAvailable ?? true;
        meal.companyId = companyId;
        meal.tripId = id;
        return meal;
      });
      await this.mealRepository.save(mealsToCreate);
    }

    return this.findOneWithSegments(id);
  }

  // ==================== READ ====================

  async findAll(
    user: UserEntity,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: {
      data: Trip[];
      total: number;
      page: number;
      limit: number;
    };
  }> {
    try {
      if (!user.activeCompanyId) {
        throw new BadRequestException(
          await this.i18n.translate('trips.validation.no_active_company'),
        );
      }

      const skip = (page - 1) * limit;

      const [trips, total] = await this.tripRepository
        .createQueryBuilder('trip')
        .leftJoinAndSelect('trip.schedule', 'schedule')
        .leftJoinAndSelect('trip.vehicle', 'vehicle')
        .leftJoinAndSelect('vehicle.seats', 'vehicleSeats')
        .leftJoinAndSelect('trip.company', 'company')
        .leftJoinAndSelect('trip.segments', 'segments')
        .leftJoinAndSelect('segments.vehicle', 'segmentVehicle')
        .leftJoinAndSelect('segmentVehicle.seats', 'segmentSeats')
        .where('trip.company_id = :companyId', { companyId: user.activeCompanyId })
        .orderBy('trip.departure_datetime', 'DESC')
        .addOrderBy('segments.segment_order', 'ASC')
        .addOrderBy('vehicleSeats.order', 'ASC')
        .addOrderBy('segmentSeats.order', 'ASC')
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      return {
        data: {
          data: trips,
          total,
          page,
          limit,
        },
      };
    } catch (error) {
      console.error('Erreur findAll trips:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new NotFoundException(
        await this.i18n.translate('trips.error.cannot_retrieve'),
      );
    }
  }

  async findAllByCompany(companyId: string): Promise<Trip[]> {
    return this.tripRepository.find({
      where: { company_id: companyId },
      relations: ['schedule', 'vehicle', 'company', 'segments', 'reservations'],
      order: { departure_datetime: 'DESC' },
    });
  }

  async findAllWithSegments(companyId?: string): Promise<Trip[]> {
    const where: any = {};
    if (companyId) where.company_id = companyId;
    return this.tripRepository.find({
      where,
      relations: [
        'segments', 'segments.vehicle', 'segments.schedule', 'vehicle',
        'schedule', 'company',
      ],
      order: { departure_datetime: 'DESC' },
    });
  }

  async findOneWithSegments(id: string): Promise<Trip> {
    const trip = await this.tripRepository.findOne({
      where: { id },
      relations: [
        'segments', 'segments.vehicle', 'segments.vehicle.seats', 'segments.schedule',
        'vehicle', 'schedule', 'company', 'reservations', 'reservations.user',
        'reservations.reservationSeats', 'reservations.reservationSeats.seat',
      ],
    });
    if (!trip) {
      throw new NotFoundException(
        await this.i18n.translate('trips.validation.trip_not_found', undefined, { id }),
      );
    }
    return trip;
  }

  async findSegmentsByTrip(tripId: string): Promise<TripSegment[]> {
    return this.tripSegmentRepository.find({
      where: { trip_id: tripId },
      relations: ['vehicle', 'schedule'],
      order: { segment_order: 'ASC' },
    });
  }

  async findByDateRange(
    startDate: Date | null,
    endDate: Date | null,
    companyId?: string,
  ): Promise<Trip[]> {
    const where: any = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.departure_datetime = Between(start, end);
    } else if (startDate && !endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      where.departure_datetime = MoreThanOrEqual(start);
    } else if (!startDate && endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.departure_datetime = LessThanOrEqual(end);
    }
    if (companyId) where.company_id = companyId;
    return this.tripRepository.find({
      where,
      relations: ['schedule', 'vehicle', 'segments'],
      order: { departure_datetime: 'ASC' },
    });
  }

  async findOne(id: string): Promise<any> {
    const trip = await this.tripRepository.findOne({
      where: { id },
      relations: [
        'schedule', 'vehicle', 'vehicle.seats', 'company', 'segments',
        'segments.vehicle', 'segments.vehicle.seats', 'reservations',
      ],
    });
    if (!trip) {
      throw new NotFoundException(
        await this.i18n.translate('trips.validation.trip_not_found', undefined, { id }),
      );
    }

    const baggageRules = await this.baggageRuleRepository.find({
      where: { company_id: trip.company_id },
    });
    const baggageRuleMap = new Map<string, VehicleBaggageRule>();
    for (const rule of baggageRules) baggageRuleMap.set(rule.vehicle_type, rule);

    const reservations = await this.reservationRepository.find({
      where: {
        trip_id: id,
        status: In([ReservationStatus.CONFIRMED, ReservationStatus.PENDING]),
      },
      relations: ['reservationSeats', 'segmentReservations'],
    });
    const reservedSeatIds = new Set<string>();
    for (const reservation of reservations) {
      for (const seat of reservation.reservationSeats || []) reservedSeatIds.add(seat.seat_id);
      for (const segRes of reservation.segmentReservations || []) reservedSeatIds.add(segRes.seat_id);
    }

    const segmentsWithSeats = (trip.segments || [])
      .sort((a, b) => a.segment_order - b.segment_order)
      .map((segment) => {
        const vehicle = segment.vehicle;
        const allSeats = vehicle?.seats || [];
        const sortedSeats = [...allSeats].sort((a, b) => (a.order || 0) - (b.order || 0));
        const availableSeats = sortedSeats.filter(seat => !reservedSeatIds.has(seat.id));
        const occupiedSeats = sortedSeats.filter(seat => reservedSeatIds.has(seat.id));

        let baggageRuleObj: {
          max_weight_kg: number;
          extra_price_per_kg: number | null;
          max_baggage_per_passenger: number;
        } | null = null;
        if (vehicle) {
          const rule = baggageRuleMap.get(vehicle.vehicle_type);
          if (rule) {
            baggageRuleObj = {
              max_weight_kg: rule.max_weight_kg,
              extra_price_per_kg: rule.extra_price_per_kg,
              max_baggage_per_passenger: rule.max_baggage_per_passenger,
            };
          }
        }

        return {
          id: segment.id,
          segment_order: segment.segment_order,
          departure_city: segment.departure_city,
          arrival_city: segment.arrival_city,
          departure_datetime: segment.departure_datetime,
          estimated_arrival_datetime: segment.estimated_arrival_datetime,
          segment_price: segment.segment_price,
          distance_km: segment.distance_km,
          vehicle_id: segment.vehicle_id,
          vehicle: vehicle ? {
            id: vehicle.id,
            vehicle_id: vehicle.id,
            license_plate: vehicle.license_plate,
            vehicle_type: vehicle.vehicle_type,
            brand: vehicle.brand,
            model: vehicle.model,
            total_seats: vehicle.total_seats,
            image: Array.isArray(vehicle.images) ? vehicle.images[0] : (vehicle.images || null),
            seats: {
              all: sortedSeats.map(s => ({ id: s.id, seat_number: s.seat_number, seat_type: s.seat_type })),
              available: availableSeats.map(s => ({ id: s.id, seat_number: s.seat_number, seat_type: s.seat_type })),
              occupied: occupiedSeats.map(s => ({ id: s.id, seat_number: s.seat_number, seat_type: s.seat_type })),
            },
            baggage_rule: baggageRuleObj,
          } : null,
        };
      });

    const tripMeals = await this.mealRepository.find({
      where: { companyId: trip.company_id, isAvailable: true, tripId: id },
      order: { name: 'ASC' },
    });

    let vehicleSeats: any = null;
    let baggageRuleForMainVehicle: any = null;
    if (trip.vehicle) {
      const allSeats = trip.vehicle.seats || [];
      const sortedSeats = [...allSeats].sort((a, b) => (a.order || 0) - (b.order || 0));
      const availableSeats = sortedSeats.filter(seat => !reservedSeatIds.has(seat.id));
      const occupiedSeats = sortedSeats.filter(seat => reservedSeatIds.has(seat.id));
      vehicleSeats = {
        all: sortedSeats.map(s => ({ id: s.id, seat_number: s.seat_number, seat_type: s.seat_type })),
        available: availableSeats.map(s => ({ id: s.id, seat_number: s.seat_number, seat_type: s.seat_type })),
        occupied: occupiedSeats.map(s => ({ id: s.id, seat_number: s.seat_number, seat_type: s.seat_type })),
      };
      const rule = baggageRuleMap.get(trip.vehicle.vehicle_type);
      if (rule) {
        baggageRuleForMainVehicle = {
          max_weight_kg: rule.max_weight_kg,
          extra_price_per_kg: rule.extra_price_per_kg,
          max_baggage_per_passenger: rule.max_baggage_per_passenger,
        };
      }
    }

    return {
      id: trip.id,
      schedule_id: trip.schedule_id,
      vehicle_id: trip.vehicle_id,
      company_id: trip.company_id,
      departure_datetime: trip.departure_datetime,
      actual_departure_datetime: trip.actual_departure_datetime,
      actual_arrival_datetime: trip.actual_arrival_datetime,
      status: trip.status,
      schedule: trip.schedule,
      vehicle: trip.vehicle ? { ...trip.vehicle, seats: vehicleSeats, baggage_rule: baggageRuleForMainVehicle } : null,
      company: trip.company,
      segments: segmentsWithSeats,
      meals: tripMeals.map(meal => ({
        id: meal.id,
        name: meal.name,
        description: meal.description,
        price: meal.price,
        imageUrl: meal.imageUrl,
      })),
      reservations: trip.reservations,
      summary: {
        total_segments: segmentsWithSeats.length,
        total_seats_available: segmentsWithSeats.reduce(
          (sum, s) => sum + (s.vehicle?.seats?.available?.length || 0), 0),
        total_seats_occupied: segmentsWithSeats.reduce(
          (sum, s) => sum + (s.vehicle?.seats?.occupied?.length || 0), 0),
      },
    };
  }

  // ==================== findByCities ====================
  async findByCities(
    departure: string,
    arrival: string,
    date?: Date,
    startDate?: Date,
    endDate?: Date,
    passengers?: number,
  ): Promise<{ trips: any[]; reversed: boolean }> {
    const departureCity = departure.split(',')[0].trim().toLowerCase();
    const arrivalCity = arrival.split(',')[0].trim().toLowerCase();

    const trips = await this.tripRepository.find({
      where: { status: ScheduleStatus.SCHEDULED },
      relations: {
        schedule: true,
        vehicle: { seats: true },
        company: true,
        segments: { vehicle: { seats: true } },
      },
    });

    const companyIds = [...new Set(trips.map(t => t.company_id))];
    const baggageRules = await this.baggageRuleRepository.find({
      where: { company_id: In(companyIds) },
    });
    const baggageRuleMap = new Map<string, VehicleBaggageRule>();
    for (const rule of baggageRules) {
      const key = `${rule.company_id}|${rule.vehicle_type}`;
      baggageRuleMap.set(key, rule);
    }

    const tripIds = trips.map(t => t.id);
    const reservations = await this.reservationRepository.find({
      where: {
        trip_id: In(tripIds),
        status: In([ReservationStatus.CONFIRMED, ReservationStatus.PENDING]),
      },
      relations: ['reservationSeats', 'segmentReservations'],
    });
    const reservedSeatsByTrip = new Map<string, Set<string>>();
    for (const res of reservations) {
      let seats = reservedSeatsByTrip.get(res.trip_id);
      if (!seats) {
        seats = new Set<string>();
        reservedSeatsByTrip.set(res.trip_id, seats);
      }
      for (const seat of res.reservationSeats || []) seats.add(seat.seat_id);
      for (const segRes of res.segmentReservations || []) seats.add(segRes.seat_id);
    }

    const result: any[] = [];
    let hasReversed = false;

    for (const trip of trips) {
      if (!trip.segments?.length) continue;
      const orderedSegments = [...trip.segments].sort((a, b) => a.segment_order - b.segment_order);

      let departurePos = -1, arrivalPos = -1;
      for (let i = 0; i < orderedSegments.length; i++) {
        const seg = orderedSegments[i];
        const depCity = seg.departure_city.trim().toLowerCase();
        const arrCity = seg.arrival_city.trim().toLowerCase();
        if (departurePos === -1 && (depCity === departureCity || depCity.includes(departureCity)))
          departurePos = i;
        if (arrCity === arrivalCity || arrCity.includes(arrivalCity))
          arrivalPos = i;
      }
      if (departurePos === -1 || arrivalPos === -1) continue;
      if (departurePos > arrivalPos) hasReversed = true;

      const selectedSegments = orderedSegments.slice(departurePos, arrivalPos + 1);
      selectedSegments.forEach((seg, idx) => { seg.segment_order = idx + 1; });

      const reservedSeatIds = reservedSeatsByTrip.get(trip.id) || new Set<string>();

      const enrichedSegments = selectedSegments.map(segment => {
        const vehicle = segment.vehicle;
        const allSeats = vehicle?.seats || [];
        const sortedSeats = [...allSeats].sort((a, b) => (a.order || 0) - (b.order || 0));
        const availableSeats = sortedSeats.filter(seat => !reservedSeatIds.has(seat.id));
        const occupiedSeats = sortedSeats.filter(seat => reservedSeatIds.has(seat.id));

        let baggageRulesObj: {
          max_weight_kg: number;
          extra_price_per_kg: number | null;
          max_baggage_per_passenger: number;
        } | null = null;

        if (vehicle) {
          const key = `${trip.company_id}|${vehicle.vehicle_type}`;
          const rule = baggageRuleMap.get(key);
          if (rule) {
            baggageRulesObj = {
              max_weight_kg: rule.max_weight_kg,
              extra_price_per_kg: rule.extra_price_per_kg,
              max_baggage_per_passenger: rule.max_baggage_per_passenger,
            };
          }
        }
        return {
          id: segment.id,
          segment_order: segment.segment_order,
          departure_city: segment.departure_city,
          arrival_city: segment.arrival_city,
          departure_datetime: segment.departure_datetime
            ? new Date(segment.departure_datetime).toISOString().slice(0, 19).replace('T', ' ')
            : null,
          estimated_arrival_datetime: segment.estimated_arrival_datetime
            ? new Date(segment.estimated_arrival_datetime).toISOString().slice(0, 19).replace('T', ' ')
            : null,
          estimated_duration_minutes: segment.estimated_duration_minutes,
          segment_price: segment.segment_price,
          distance_km: segment.distance_km,
          vehicle_id: segment.vehicle_id,
          vehicle: vehicle ? {
            id: vehicle.id,
            vehicle_id: vehicle.id,
            license_plate: vehicle.license_plate,
            vehicle_type: vehicle.vehicle_type,
            brand: vehicle.brand,
            model: vehicle.model,
            total_seats: vehicle.total_seats,
            image: Array.isArray(vehicle.images) ? vehicle.images[0] : (vehicle.images || null),
            seats: {
              all: sortedSeats.map(s => ({ id: s.id, seat_number: s.seat_number, seat_type: s.seat_type })),
              available: availableSeats.map(s => ({ id: s.id, seat_number: s.seat_number, seat_type: s.seat_type })),
              occupied: occupiedSeats.map(s => ({ id: s.id, seat_number: s.seat_number, seat_type: s.seat_type })),
            },
            baggage_rule: baggageRulesObj,
          } : null,
        };
      });

      if (passengers && passengers > 0) {
        let hasEnoughSeats = true;
        for (const seg of enrichedSegments) {
          const availableCount = seg?.vehicle?.seats?.available?.length || 0;
          if (availableCount < passengers) {
            hasEnoughSeats = false;
            break;
          }
        }
        if (!hasEnoughSeats) continue;
      }

      const tripMeals = await this.mealRepository.find({
        where: { companyId: trip.company_id, isAvailable: true, tripId: trip.id },
        order: { name: 'ASC' },
      });

      const enrichedTrip = {
        ...trip,
        vehicle: null,
        segments: enrichedSegments,
        meals: tripMeals.map(meal => ({
          id: meal.id,
          name: meal.name,
          description: meal.description,
          price: meal.price,
          imageUrl: meal.imageUrl,
        })),
        summary: {
          total_segments: enrichedSegments.length,
          total_seats_available: enrichedSegments.reduce(
            (sum, s) => sum + (s.vehicle?.seats?.available?.length || 0), 0),
          total_seats_occupied: enrichedSegments.reduce(
            (sum, s) => sum + (s.vehicle?.seats?.occupied?.length || 0), 0),
        },
      };
      result.push(enrichedTrip);
    }

    let filtered = result;
    let effectiveStart: Date | undefined, effectiveEnd: Date | undefined;
    if (date) {
      effectiveStart = new Date(date); effectiveStart.setHours(0, 0, 0, 0);
      effectiveEnd = new Date(date); effectiveEnd.setHours(23, 59, 59, 999);
    } else if (startDate) {
      effectiveStart = new Date(startDate); effectiveStart.setHours(0, 0, 0, 0);
      effectiveEnd = endDate ? new Date(endDate) : new Date(startDate); effectiveEnd.setHours(23, 59, 59, 999);
    }
    if (effectiveStart && effectiveEnd) {
      filtered = filtered.filter(trip => {
        const tripDate = new Date(trip.departure_datetime);
        return tripDate >= effectiveStart! && tripDate <= effectiveEnd!;
      });
    }

    filtered.sort((a, b) => new Date(a.departure_datetime).getTime() - new Date(b.departure_datetime).getTime());
    return { trips: filtered, reversed: hasReversed };
  }

  async getAvailableSeats(tripId: string): Promise<any> {
    const trip = await this.findOneWithSegments(tripId);
    const segments = trip.segments || [];

    const result = {
      trip_id: tripId,
      departure_datetime: trip.departure_datetime,
      segments: [] as any[],
      total_available_seats: 0,
    };

    for (const segment of segments) {
      const vehicle = await this.vehicleRepository.findOne({
        where: { id: segment.vehicle_id },
        relations: ['seats'],
      });

      const reservedSeats = await this.reservationRepository
        .createQueryBuilder('reservation')
        .innerJoin('reservation.segmentReservations', 'segmentRes')
        .where('segmentRes.segment_id = :segmentId', { segmentId: segment.id })
        .andWhere('reservation.status != :cancelled', { cancelled: ReservationStatus.CANCELLED })
        .select('segmentRes.seat_id')
        .getMany();

      const reservedSeatIds = new Set(
        reservedSeats.flatMap(r => r.segmentReservations?.map(sr => sr.seat_id) || []),
      );

      const availableSeats = vehicle?.seats.filter(seat => !reservedSeatIds.has(seat.id)) || [];

      result.segments.push({
        segment_id: segment.id,
        segment_order: segment.segment_order,
        departure_city: segment.departure_city,
        arrival_city: segment.arrival_city,
        departure_datetime: segment.departure_datetime,
        total_seats: vehicle?.seats.length || 0,
        reserved_seats: reservedSeatIds.size,
        available_seats: availableSeats.length,
        available_seats_list: availableSeats,
      });

      result.total_available_seats += availableSeats.length;
    }

    return result;
  }

  // ==================== UPDATE ====================

  async updateStatus(
    id: string,
    status: ScheduleStatus,
    companyId?: string,
  ): Promise<Trip> {
    const trip = await this.findOne(id);

    if (companyId && trip.company_id !== companyId) {
      throw new ForbiddenException(
        await this.i18n.translate('trips.update.forbidden'),
      );
    }

    const oldStatus = trip.status;
    trip.status = status;

    if (status === ScheduleStatus.IN_PROGRESS && !trip.actual_departure_datetime) {
      trip.actual_departure_datetime = new Date();
      const firstSegment = await this.tripSegmentRepository.findOne({
        where: { trip_id: id, segment_order: 1 },
      });
      if (firstSegment) {
        firstSegment.actual_departure_datetime = new Date();
        firstSegment.status = ScheduleStatus.IN_PROGRESS;
        await this.tripSegmentRepository.save(firstSegment);
      }
    }

    if (status === ScheduleStatus.COMPLETED && !trip.actual_arrival_datetime) {
      trip.actual_arrival_datetime = new Date();
      const segments = await this.tripSegmentRepository.find({
        where: { trip_id: id },
        order: { segment_order: 'DESC' },
        take: 1,
      });
      if (segments.length > 0) {
        segments[0].actual_arrival_datetime = new Date();
        segments[0].status = ScheduleStatus.COMPLETED;
        await this.tripSegmentRepository.save(segments[0]);
      }
    }

    const updatedTrip = await this.tripRepository.save(trip);

    if (oldStatus !== status) {
      await this.notifyCustomersAboutTripStatus(trip, oldStatus, status);
    }

    return updatedTrip;
  }

  private async resetTripSeats(tripId: string): Promise<void> {
    try {
      const reservations = await this.reservationRepository.find({
        where: {
          trip_id: tripId,
          status: In([ReservationStatus.CONFIRMED, ReservationStatus.PENDING]),
        },
        relations: ['reservationSeats', 'reservationSegments'],
      });

      if (reservations.length === 0) {
        console.log(
          await this.i18n.translate('trips.reset.no_reservations', undefined, { tripId }),
        );
        return;
      }

      for (const reservation of reservations) {
        reservation.status = ReservationStatus.CANCELLED;
        await this.reservationRepository.save(reservation);
      }

      console.log(
        await this.i18n.translate('trips.reset.reservations_cancelled', undefined, { count: reservations.length, tripId }),
      );
    } catch (error) {
      console.error(
        await this.i18n.translate('trips.reset.error', undefined, { tripId }),
        error,
      );
      throw error;
    }
  }

  private async notifyCustomersAboutTripStatus(
    trip: Trip,
    oldStatus: string,
    newStatus: string,
  ): Promise<void> {
    try {
      if (newStatus === ScheduleStatus.CANCELLED || newStatus === ScheduleStatus.DELAYED) {
        await this.resetTripSeats(trip.id);
      }

      const allowedStatuses = [
        ScheduleStatus.IN_PROGRESS,
        ScheduleStatus.COMPLETED,
        ScheduleStatus.CANCELLED,
        ScheduleStatus.DELAYED,
      ];

      if (!allowedStatuses.includes(newStatus as any)) {
        console.log(
          await this.i18n.translate('trips.notify.status_ignored', undefined, { status: newStatus }),
        );
        return;
      }

      const segments = await this.tripSegmentRepository.find({
        where: { trip_id: trip.id },
        order: { segment_order: 'ASC' },
      });

      let departureCity = 'Départ';
      let arrivalCity = 'Arrivée';
      if (segments.length > 0) {
        departureCity = segments[0].departure_city;
        arrivalCity = segments[segments.length - 1].arrival_city;
      }

      const reservations = await this.reservationRepository.find({
        where: { trip_id: trip.id, status: Not(ReservationStatus.CANCELLED) },
        relations: ['user', 'trip', 'trip.segments', 'trip.segments.vehicle', 'baggageList'],
      });
      if (reservations.length === 0) return;

      for (const reservation of reservations) {
        const user = reservation.user;
        if (!user) continue;

        const hasPhone = user.phone && user.phone.trim() !== '';
        let title = '', message = '', smsMessage = '';

        switch (newStatus) {
          case ScheduleStatus.IN_PROGRESS:
            title = await this.i18n.translate('trip.notification.in_progress.title', undefined, { departureCity, arrivalCity });
            message = await this.i18n.translate('trip.notification.in_progress.body', undefined, { departureCity, arrivalCity });
            smsMessage = await this.i18n.translate('trip.notification.in_progress.sms', undefined, { departureCity, arrivalCity });
            break;
          case ScheduleStatus.COMPLETED:
            title = await this.i18n.translate('trip.notification.completed.title', undefined, { departureCity, arrivalCity });
            message = await this.i18n.translate('trip.notification.completed.body', undefined, { departureCity, arrivalCity });
            smsMessage = await this.i18n.translate('trip.notification.completed.sms', undefined, { departureCity, arrivalCity });
            break;
          case ScheduleStatus.CANCELLED:
            title = await this.i18n.translate('trip.notification.cancelled.title', undefined, { departureCity, arrivalCity });
            message = await this.i18n.translate('trip.notification.cancelled.body', undefined, { departureCity, arrivalCity });
            smsMessage = await this.i18n.translate('trip.notification.cancelled.sms', undefined, { departureCity, arrivalCity });
            break;
          case ScheduleStatus.DELAYED:
            title = await this.i18n.translate('trip.notification.delayed.title', undefined, { departureCity, arrivalCity });
            message = await this.i18n.translate('trip.notification.delayed.body', undefined, { departureCity, arrivalCity });
            smsMessage = await this.i18n.translate('trip.notification.delayed.sms', undefined, { departureCity, arrivalCity });
            break;
          default:
            continue;
        }

        if (hasPhone) {
          try {
            await this.smsHelper.sendSms(user.phone, smsMessage);
            console.log(`✅ SMS envoyé à ${user.phone}`);
          } catch (smsError) {
            console.error('❌ Erreur envoi SMS:', smsError);
          }
        }

        try {
          await this.pushNotificationHelper.sendAll({
            userId: user.id,
            pushTitle: title,
            pushBody: message,
            pushData: {
              entity: 'TRIP',
              entityId: trip.id,
              status: newStatus,
              departureCity,
              arrivalCity,
            },
          });
          console.log(`✅ Push notification envoyée à ${user.id}`);
        } catch (pushError) {
          console.error('❌ Erreur envoi push:', pushError);
        }

        try {
          await this.notificationsService.sendAndSaveNotification(
            user.id,
            title,
            message,
            NotificationType.LOGISTIC,
            {
              tripId: trip.id,
              status: newStatus,
              departureCity,
              arrivalCity,
            },
          );
          console.log(`✅ Notification in-app envoyée à ${user.id}`);
        } catch (notifError) {
          console.error('❌ Erreur notification in-app:', notifError);
        }
      }

      console.log(
        await this.i18n.translate('trips.notify.clients_notified', undefined, { count: reservations.length, tripId: trip.id, status: newStatus }),
      );
    } catch (error) {
      console.error('Erreur lors de la notification des clients:', error);
    }
  }

  async updateSegmentStatus(
    segmentId: string,
    status: ScheduleStatus,
  ): Promise<TripSegment> {
    const segment = await this.tripSegmentRepository.findOne({
      where: { id: segmentId },
      relations: ['trip'],
    });
    if (!segment) {
      throw new NotFoundException(
        await this.i18n.translate('trips.validation.segment_not_found', undefined, { id: segmentId }),
      );
    }

    segment.status = status;

    if (status === ScheduleStatus.IN_PROGRESS && !segment.actual_departure_datetime) {
      segment.actual_departure_datetime = new Date();
    }
    if (status === ScheduleStatus.COMPLETED && !segment.actual_arrival_datetime) {
      segment.actual_arrival_datetime = new Date();
    }

    await this.tripSegmentRepository.save(segment);

    const segments = await this.tripSegmentRepository.find({
      where: { trip_id: segment.trip_id },
    });
    const allCompleted = segments.every(s => s.status === ScheduleStatus.COMPLETED);

    if (allCompleted) {
      await this.updateStatus(segment.trip_id, ScheduleStatus.COMPLETED);
    }

    return segment;
  }

  async findSegmentById(segmentId: string): Promise<TripSegment> {
    const segment = await this.tripSegmentRepository.findOne({
      where: { id: segmentId },
      relations: ['vehicle', 'trip'],
    });
    if (!segment) {
      throw new NotFoundException(
        await this.i18n.translate('trips.validation.segment_not_found', undefined, { id: segmentId }),
      );
    }
    return segment;
  }

  // ==================== DELETE ====================

  async remove(id: string, companyId?: string): Promise<void> {
    const trip = await this.findOne(id);

    if (companyId && trip.company_id !== companyId) {
      throw new ForbiddenException(
        await this.i18n.translate('trips.delete.forbidden'),
      );
    }

    const hasReservations = await this.reservationRepository.count({
      where: { trip_id: id },
    });
    if (hasReservations > 0) {
      throw new BadRequestException(
        await this.i18n.translate('trips.delete.has_reservations'),
      );
    }

    await this.tripRepository.remove(trip);
  }

  // ==================== STATISTICS ====================

  async getTripStats(
    companyId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    const where: any = { company_id: companyId };
    if (startDate && endDate) where.departure_datetime = Between(startDate, endDate);
    const trips = await this.tripRepository.find({ where });

    const stats = {
      total_trips: trips.length,
      scheduled: trips.filter(t => t.status === ScheduleStatus.SCHEDULED).length,
      in_progress: trips.filter(t => t.status === ScheduleStatus.IN_PROGRESS).length,
      completed: trips.filter(t => t.status === ScheduleStatus.COMPLETED).length,
      cancelled: trips.filter(t => t.status === ScheduleStatus.CANCELLED).length,
      delayed: trips.filter(t => t.status === ScheduleStatus.DELAYED).length,
      total_reservations: 0,
      total_revenue: 0,
    };

    for (const trip of trips) {
      const reservations = await this.reservationRepository.find({
        where: { trip_id: trip.id, status: Not(ReservationStatus.CANCELLED) },
      });
      stats.total_reservations += reservations.length;
      stats.total_revenue += reservations.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
    }

    return stats;
  }

  // ==================== HELPER METHODS ====================

  private async checkVehicleAvailability(
    vehicleId: string,
    departureDate: Date,
    excludeTripId?: string,
  ): Promise<void> {
    const whereCondition: any = {
      vehicle_id: vehicleId,
      departure_datetime: Between(departureDate, new Date(departureDate.getTime() + 3600000)),
    };
    if (excludeTripId) whereCondition.id = Not(excludeTripId);

    const existingTrip = await this.tripRepository.findOne({
      where: whereCondition,
    });

    if (existingTrip) {
      throw new BadRequestException(
        await this.i18n.translate('trips.validation.vehicle_already_booked'),
      );
    }
  }
}