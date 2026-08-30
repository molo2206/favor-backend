import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ride } from './entity/Ride.entity';
import { CreateRideDto } from './dto/create-ride.dto';
import { UpdateRideDto } from './dto/update-ride.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { City } from 'src/company/entities/city.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { RideStatus } from './enum/RideStatus.enum';
import { DriverLocationService } from '../DriverLocation/driver-location.service';
import { NotificationsService } from 'src/notification/notifications.service';
import { NotificationType } from 'src/notification/type/notification.type';
import { NotificationHelper } from 'src/notification/utils/notification.helper';
import { I18nService } from 'src/libs/common/src';

@Injectable()
export class RideService {
  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(City)
    private readonly cityRepo: Repository<City>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,

    private readonly driverLocationService: DriverLocationService,

    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,

    private readonly notificationHelper: NotificationHelper,
    private readonly i18n: I18nService, // ✅ Ajout de l'injection
  ) { }

  async create(dto: CreateRideDto, customer: UserEntity, lang: string = 'fr') {
    // Vérifications
    const rider = await this.userRepo.findOne({ where: { id: customer.id } });
    if (!rider) {
      throw new NotFoundException(
        await this.i18n.translate('ride.rider_not_found', lang),
      );
    }

    if (dto.driverId) {
      const driver = await this.userRepo.findOne({
        where: { id: dto.driverId },
      });
      if (!driver) {
        throw new NotFoundException(
          await this.i18n.translate('ride.driver_not_found', lang),
        );
      }
    }

    const city = await this.cityRepo.findOne({
      where: { id: dto.cityId, status: true },
    });
    if (!city) {
      throw new NotFoundException(
        await this.i18n.translate('ride.city_not_found_or_inactive', lang),
      );
    }

    const category = await this.categoryRepo.findOne({
      where: { id: dto.categoryId, status: true },
    });
    if (!category) {
      throw new NotFoundException(
        await this.i18n.translate('ride.category_not_found_or_inactive', lang),
      );
    }

    // Création
    const ride = this.rideRepo.create({
      ...dto,
      riderId: customer.id,
      status: RideStatus.PENDING,
    });
    const saved = await this.rideRepo.save(ride);

    // Récupérer les chauffeurs disponibles
    const availableDrivers = await this.driverLocationService.findDriversNear(
      dto.pickupLocation.lat,
      dto.pickupLocation.lng,
      5,
    );

    // Envoyer notification aux chauffeurs
    if (availableDrivers.length > 0) {
      const notificationPromises = availableDrivers.map((driver) =>
        this.notificationsService.sendAndSaveNotification(
          driver.id,
          this.notificationHelper.getNotificationTitle(
            NotificationType.NEW_RIDE,
            lang,
            { rideId: saved.id, pickupLocation: dto.pickupLocation },
          ),
          this.notificationHelper.getNotificationContent(
            NotificationType.NEW_RIDE,
            lang,
            {
              pickupLocation: dto.pickupLocation,
              dropoffLocation: dto.dropoffLocation,
              price: dto.price,
              distance: dto.distance,
              duration: dto.duration,
            },
          ),
          NotificationType.NEW_RIDE,
          {
            rideId: saved.id,
            pickupLocation: dto.pickupLocation,
            dropoffLocation: dto.dropoffLocation,
            riderName: customer.fullName,
            price: dto.price,
            distance: dto.distance,
            duration: dto.duration,
          },
        ),
      );
      await Promise.all(notificationPromises);
    }

    // Notifier le passager
    await this.notificationHelper.sendNotification(
      this.notificationsService,
      customer.id,
      NotificationType.NEW_RIDE,
      lang,
      {
        rideId: saved.id,
        pickupLocation: dto.pickupLocation,
        dropoffLocation: dto.dropoffLocation,
        message: await this.i18n.translate(
          'ride.ride_created_searching_drivers',
          lang,
        ),
        price: dto.price,
        distance: dto.distance,
        duration: dto.duration,
        driversNotified: availableDrivers.length,
      },
    );

    return {
      message: await this.i18n.translate('ride.ride_created_success', lang),
      data: {
        ...saved,
        notificationsSent: availableDrivers.length,
      },
    };
  }

  async findAll(lang: string = 'fr') {
    const data = await this.rideRepo.find({
      relations: ['rider', 'driver', 'city', 'category'],
    });
    return {
      message: await this.i18n.translate('ride.rides_list_retrieved', lang),
      data,
    };
  }

  async findOne(id: string, lang: string = 'fr') {
    const ride = await this.rideRepo.findOne({
      where: { id },
      relations: ['rider', 'driver', 'city', 'category'],
    });

    if (!ride) {
      throw new NotFoundException(
        await this.i18n.translate('ride.ride_not_found', lang),
      );
    }

    const rideResponse = {
      ...ride,
      rider: ride.rider ? this.sanitizeUser(ride.rider) : null,
      driver: ride.driver ? this.sanitizeUser(ride.driver) : null,
    };

    return {
      message: await this.i18n.translate('ride.ride_retrieved', lang),
      data: rideResponse,
    };
  }

  async update(id: string, dto: UpdateRideDto, lang: string = 'fr') {
    const ride = await this.rideRepo.findOne({ where: { id } });
    if (!ride) {
      throw new NotFoundException(
        await this.i18n.translate('ride.ride_not_found', lang),
      );
    }

    Object.assign(ride, dto);
    const updated = await this.rideRepo.save(ride);

    if (dto.status === RideStatus.CANCELLED && dto.cancelledBy) {
      const notifyUserId =
        dto.cancelledBy === 'RIDER' ? ride.driverId : ride.riderId;
      if (notifyUserId) {
        await this.notificationHelper.sendNotification(
          this.notificationsService,
          notifyUserId,
          NotificationType.RIDE_CANCELLED,
          lang,
          {
            rideId: ride.id,
            cancelledBy: dto.cancelledBy,
            pickupLocation: ride.pickupLocation,
          },
        );
      }
    }

    return {
      message: await this.i18n.translate('ride.ride_updated', lang),
      data: updated,
    };
  }

  async remove(id: string, lang: string = 'fr') {
    const ride = await this.rideRepo.findOne({ where: { id } });
    if (!ride) {
      throw new NotFoundException(
        await this.i18n.translate('ride.ride_not_found', lang),
      );
    }
    await this.rideRepo.remove(ride);
    return {
      message: await this.i18n.translate('ride.ride_deleted', lang),
      data: null,
    };
  }

  async updateDriver(rideId: string, driverId: string, lang: string = 'fr') {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['rider', 'driver'],
    });

    if (!ride) {
      throw new NotFoundException(
        await this.i18n.translate('ride.ride_not_found', lang),
      );
    }

    if (ride.driverId) {
      throw new BadRequestException(
        await this.i18n.translate('ride.ride_already_accepted', lang),
      );
    }

    const driver = await this.userRepo.findOne({
      where: { id: driverId },
    });
    if (!driver) {
      throw new NotFoundException(
        await this.i18n.translate('ride.driver_not_found', lang),
      );
    }

    ride.driverId = driverId;
    ride.status = RideStatus.ACCEPTED;
    const updatedRide = await this.rideRepo.save(ride);

    await this.notificationHelper.sendNotification(
      this.notificationsService,
      ride.riderId,
      NotificationType.RIDE_ACCEPTED,
      lang,
      {
        rideId: ride.id,
        driver: {
          fullName: driver.fullName,
          phone: driver.phone,
          image: driver.image,
        },
        pickupLocation: ride.pickupLocation,
        distance: ride.distance,
        duration: ride.duration,
        price: ride.price,
      },
    );

    return updatedRide;
  }

  async cancelRide(
    rideId: string,
    cancelledBy: 'RIDER' | 'DRIVER' | 'SYSTEM',
    cancellationReason?: string,
    lang: string = 'fr',
  ) {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['rider', 'driver'],
    });

    if (!ride) {
      throw new NotFoundException(
        await this.i18n.translate('ride.ride_not_found', lang),
      );
    }

    ride.status = RideStatus.CANCELLED;
    ride.cancelledBy = cancelledBy;
    if (cancellationReason) {
      ride.cancellationReason = cancellationReason;
    }
    const updatedRide = await this.rideRepo.save(ride);

    const notifyUserId = cancelledBy === 'RIDER' ? ride.driverId : ride.riderId;
    if (notifyUserId) {
      await this.notificationHelper.sendNotification(
        this.notificationsService,
        notifyUserId,
        NotificationType.RIDE_CANCELLED,
        lang,
        {
          rideId: ride.id,
          cancelledBy,
          pickupLocation: ride.pickupLocation,
          cancellationReason,
        },
      );
    }

    return updatedRide;
  }

  // Helper pour nettoyer les objets utilisateur
  private sanitizeUser(user: UserEntity): any {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      image: user.image,
      role: user.role,
      country: user.country,
      city: user.city,
      provider: user.provider,
      isActive: user.isActive,
      deleted: user.deleted,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      address: user.address,
      preferredLanguage: user.preferredLanguage,
      loyaltyPoints: user.loyaltyPoints,
      dateOfBirth: user.dateOfBirth,
      vehicleType: user.vehicleType,
      plateNumber: user.plateNumber,
      licenseDocumentUrl: user.licenseDocumentUrl,
      isTwoFAEnabled: user.isTwoFAEnabled,
      socketId: user.socketId,
      activeCompanyId: user.activeCompanyId,
      defaultAddressId: user.defaultAddressId,
      appleUserId: user.appleUserId,
      vehicles: user.vehicles,
    };
  }
}