/* eslint-disable no-constant-binary-expression */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { RoomAvailability } from './entity/RoomAvailability.entity';
import { Product } from 'src/products/entities/product.entity';
import { Reservation } from './entity/Reservation.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { CreateRoomAvailabilityDto } from './dto/create-room-availability-dto';
import { PriceCalculator } from 'src/users/utility/helpers/price-calculator.util';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import { MailOrderService } from 'src/email/emailorder.service';
import { InvoiceService } from 'src/order/invoice/invoice.util';
import { ReservationStatus } from './enum/reservation-room.enum';
import { UpdateReservationStatusDto } from './dto/update-reservation-status.dto';
import { isValidReservationStatusTransition } from 'src/users/utility/helpers/reservation-status.util';
import { sanitizeUser } from 'src/users/utility/helpers/anitizeUser.util';
import { LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { CompanyStatus } from 'src/company/enum/company-status.enum';

@Injectable()
export class RoomAvailabilityService {
  constructor(
    @InjectRepository(RoomAvailability)
    private availabilityRepo: Repository<RoomAvailability>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(Reservation)
    private reservationRepo: Repository<Reservation>,
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRepository(CompanyEntity)
    private companyRepo: Repository<CompanyEntity>,
    private readonly smsHelper: SmsHelper,
    private readonly mailService: MailOrderService,
    private readonly invoiceService: InvoiceService,
    private readonly i18n: I18nService,
  ) { }

  async create(dto: CreateRoomAvailabilityDto, lang: string = 'fr') {
    const product = await this.productRepo.findOne({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException(await this.i18n.translate('reservation.error.product_not_found', lang));

    const existing = await this.availabilityRepo.findOne({
      where: { product: { id: dto.productId }, date: dto.date },
      relations: ['product'],
    });

    if (existing) {
      existing.roomsAvailable = dto.roomsAvailable;
      existing.roomsRemaining = existing.roomsAvailable - (existing.roomsBooked ?? 0);
      const saved = await this.availabilityRepo.save(existing);
      return { message: await this.i18n.translate('reservation.availability_updated', lang), data: saved };
    }

    const availability = this.availabilityRepo.create({
      product,
      date: dto.date,
      roomsAvailable: dto.roomsAvailable,
      roomsBooked: dto.roomsBooked ?? 0,
      roomsRemaining: (dto.roomsAvailable ?? product.quantity) - (dto.roomsBooked ?? 0),
    });

    const saved = await this.availabilityRepo.save(availability);
    return { message: await this.i18n.translate('reservation.availability_created', lang), data: saved };
  }

  async update(id: string, changes: Partial<RoomAvailability>, lang: string = 'fr') {
    const existing = await this.availabilityRepo.findOne({
      where: { id },
      relations: ['product'],
    });
    if (!existing) throw new NotFoundException(await this.i18n.translate('reservation.error.availability_not_found', lang));

    Object.assign(existing, changes);
    existing.roomsRemaining = existing.roomsAvailable - existing.roomsBooked;

    const saved = await this.availabilityRepo.save(existing);
    return { message: await this.i18n.translate('reservation.availability_updated', lang), data: saved };
  }

  async updateAvailabilityRange(
    productId: string,
    startDate: Date,
    endDate: Date,
    roomsChange: number,
  ) {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException(await this.i18n.translate('reservation.error.product_not_found', 'fr')); // fallback

    const dates = this.getDateRange(startDate, endDate);
    const updatedAvailabilities: RoomAvailability[] = [];

    for (const date of dates) {
      const dateStr = date.toISOString().split('T')[0];

      let availability = await this.availabilityRepo.findOne({
        where: { product: { id: productId }, date: dateStr },
        relations: ['product'],
      });

      if (!availability) {
        availability = this.availabilityRepo.create({
          product,
          date: dateStr,
          roomsAvailable: 0,
          roomsBooked: 0,
        });
      }

      availability.roomsAvailable += roomsChange;
      if (availability.roomsAvailable < 0) availability.roomsAvailable = 0;
      availability.roomsRemaining = availability.roomsAvailable - availability.roomsBooked;

      const saved = await this.availabilityRepo.save(availability);
      updatedAvailabilities.push(saved);
    }

    return updatedAvailabilities;
  }

  private getDateRange(start: Date, end: Date): Date[] {
    const dates: Date[] = [];
    const current = new Date(start);
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  async findForProductBetween(productId: string, from: string, to: string, lang: string = 'fr') {
    const data = await this.availabilityRepo
      .createQueryBuilder('a')
      .where('a.productId = :productId', { productId })
      .andWhere('a.date >= :from AND a.date <= :to', { from, to })
      .orderBy('a.date', 'ASC')
      .getMany();

    return { message: await this.i18n.translate('reservation.availability_fetched', lang), data };
  }

  async generateCalendar(productId: string, from: string, to: string, lang: string = 'fr') {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException(await this.i18n.translate('reservation.error.product_not_found', lang));

    const dates = this.listDates(from, to);
    const toSave: RoomAvailability[] = [];

    for (const date of dates) {
      const existing = await this.availabilityRepo.findOne({
        where: { product: { id: productId }, date },
      });
      if (!existing) {
        const entry = this.availabilityRepo.create({
          product,
          date,
          roomsAvailable: product.quantity ?? 0,
          roomsBooked: 0,
          roomsRemaining: product.quantity ?? 0,
        });
        toSave.push(entry);
      }
    }

    if (toSave.length) await this.availabilityRepo.save(toSave);
    return { message: await this.i18n.translate('reservation.calendar_generated', lang), data: { created: toSave.length } };
  }

  async reserveRoom(
    userId: string,
    dto: {
      productId: string;
      startDate: string;
      endDate: string;
      adults: number;
      children: number;
      quantity?: number;
      specialRequest?: string;
    },
    lang: string = 'fr',
  ) {
    const product = await this.productRepo.findOne({
      where: { id: dto.productId },
      select: ['id', 'price', 'detail', 'gros', 'dailyRate', 'salePrice', 'name'],
    });
    if (!product) throw new NotFoundException(await this.i18n.translate('reservation.error.product_not_found', lang));

    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'fullName', 'email', 'phone', 'image', 'role', 'country', 'city'],
    });
    if (!user) throw new NotFoundException(await this.i18n.translate('reservation.error.user_not_found', lang));

    const overlappingReservation = await this.reservationRepo.findOne({
      where: {
        product: { id: dto.productId },
        startDate: LessThanOrEqual(dto.endDate),
        endDate: MoreThanOrEqual(dto.startDate),
      },
    });

    if (overlappingReservation) {
      throw new BadRequestException(
        await this.i18n.translate('reservation.error.dates_not_available', lang, { start: dto.startDate, end: dto.endDate }),
      );
    }

    const dates = this.listDates(dto.startDate, dto.endDate);
    const DEFAULT_ROOMS_AVAILABLE = 10;
    const roomsToBook = dto.quantity ?? 1;

    const availabilityRecords: RoomAvailability[] = [];

    for (const date of dates) {
      let availability = await this.availabilityRepo.findOne({
        where: { product: { id: dto.productId }, date },
      });

      if (!availability) {
        availability = this.availabilityRepo.create({
          product,
          date,
          roomsAvailable: DEFAULT_ROOMS_AVAILABLE,
          roomsBooked: 0,
          roomsRemaining: DEFAULT_ROOMS_AVAILABLE,
        });
        availability = await this.availabilityRepo.save(availability);
      }

      if (availability.roomsAvailable < roomsToBook) {
        throw new BadRequestException(
          await this.i18n.translate('reservation.error.not_enough_rooms', lang, {
            available: availability.roomsAvailable,
            date,
            requested: roomsToBook,
          }),
        );
      }

      availability.roomsAvailable -= roomsToBook;
      availability.roomsBooked += roomsToBook;
      availability.roomsRemaining = availability.roomsAvailable;

      availabilityRecords.push(availability);
    }

    await this.availabilityRepo.save(availabilityRecords);

    const calculatedTotalPrice = PriceCalculator.calculateTotalPrice(
      product,
      dto.startDate,
      dto.endDate,
      roomsToBook,
    );

    const reservation = this.reservationRepo.create({
      user,
      product,
      startDate: dto.startDate,
      endDate: dto.endDate,
      adults: dto.adults,
      children: dto.children,
      quantity: roomsToBook,
      totalPrice: calculatedTotalPrice,
      invoiceNumber: this.invoiceService.generateInvoiceNumber(),
    });

    const saved = await this.reservationRepo.save(reservation);

    const hasEmail = user.email && user.email.trim() !== '';
    const hasPhone = user.phone && user.phone.trim() !== '';

    if (!hasEmail && !hasPhone) {
      throw new BadRequestException(
        await this.i18n.translate('reservation.error.no_contact_method', lang),
      );
    }

    if (hasEmail) {
      await this.mailService.sendReservationPdf(
        user.email,
        await this.i18n.translate('reservation.email.confirmation_subject', lang),
        {
          user,
          reservation: {
            id: reservation.id,
            invoiceNumber: reservation.invoiceNumber,
            productName: product.name,
            productPrice: product.gros ?? 0,
            startDate: dto.startDate,
            endDate: dto.endDate,
            totalPrice: calculatedTotalPrice,
            adults: dto.adults,
            children: dto.children,
            roomsBooked: roomsToBook,
            status: reservation.status,
          },
        },
      );
    }

    if (hasPhone) {
      const message = await this.i18n.translate('reservation.sms.confirmation_body', lang, {
        productName: product.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
        totalPrice: calculatedTotalPrice,
      });
      await this.smsHelper.sendSms(user.phone, message);
    }

    return {
      message: await this.i18n.translate('reservation.created_success', lang),
      data: saved,
    };
  }

  async getUserReservations(
    userId: string,
    filters?: { page?: number; limit?: number },
    lang: string = 'fr',
  ) {
    const page = filters?.page ? Number(filters.page) : undefined;
    const limit = filters?.limit ? Number(filters.limit) : undefined;
    const skip = page && limit ? (page - 1) * limit : undefined;

    const query = this.reservationRepo
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.user', 'user')
      .leftJoinAndSelect('reservation.product', 'product')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('product.productAttributes', 'productAttributes')
      .leftJoinAndSelect('product.variations', 'variations')
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('product.wishlist', 'wishlist')
      .leftJoinAndSelect('product.availability', 'availability')
      .leftJoinAndSelect('product.reservations', 'allReservations')
      .where('user.id = :userId', { userId })
      .orderBy('reservation.createdAt', 'DESC');

    if (limit !== undefined) query.take(limit);
    if (skip !== undefined) query.skip(skip);

    const [data, total] = await query.getManyAndCount();

    data.forEach((reservation) => {
      reservation.user = sanitizeUser(reservation.user);
    });

    return {
      message: await this.i18n.translate('reservation.user_reservations_fetched', lang),
      data: {
        data,
        total,
        page: page ?? 1,
        limit: limit ?? total,
      },
    };
  }

  async getCompanyReservations(
    companyId: string,
    filters?: {
      startDate?: string;
      endDate?: string;
      status?: ReservationStatus;
      page?: number;
      limit?: number;
    },
    lang: string = 'fr',
  ) {
    const { startDate, endDate, status } = filters || {};
    const page = filters?.page ? Number(filters.page) : 1;
    const limit = filters?.limit ? Number(filters.limit) : 10;
    const skip = (page - 1) * limit;

    const query = this.reservationRepo
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.user', 'user')
      .leftJoinAndSelect('reservation.product', 'product')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('product.productAttributes', 'productAttributes')
      .leftJoinAndSelect('product.variations', 'variations')
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('product.wishlist', 'wishlist')
      .leftJoinAndSelect('product.availability', 'availability')
      .leftJoinAndSelect('product.reservations', 'allReservations')
      .where('company.id = :companyId', { companyId })
      .orderBy('reservation.createdAt', 'DESC')
      .take(limit)
      .skip(skip);

    if (status) query.andWhere('reservation.status = :status', { status });
    if (startDate) query.andWhere('reservation.startDate >= :startDate', { startDate });
    if (endDate) query.andWhere('reservation.endDate <= :endDate', { endDate });

    const [data, total] = await query.getManyAndCount();

    data.forEach((reservation) => {
      reservation.user = sanitizeUser(reservation.user);
    });

    return {
      message: await this.i18n.translate('reservation.company_reservations_fetched', lang),
      data: {
        data,
        total,
        page,
        limit,
      },
    };
  }

  async getAllReservations(lang: string = 'fr') {
    const data = await this.reservationRepo
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.user', 'user')
      .leftJoinAndSelect('reservation.product', 'product')
      .leftJoinAndSelect('product.company', 'company')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('product.productAttributes', 'productAttributes')
      .leftJoinAndSelect('product.variations', 'variations')
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('product.wishlist', 'wishlist')
      .leftJoinAndSelect('product.availability', 'availability')
      .orderBy('reservation.createdAt', 'DESC')
      .getMany();

    data.forEach((reservation) => {
      if (reservation.user) reservation.user = sanitizeUser(reservation.user);
    });

    return {
      message: await this.i18n.translate('reservation.all_reservations_fetched', lang),
      data,
      total: data.length,
    };
  }

  async getMostVisitedHotels(page = 1, limit = 10, lang: string = 'fr') {
    const skip = (page - 1) * limit;

    const hotelStats = await this.reservationRepo
      .createQueryBuilder('reservation')
      .leftJoin('reservation.product', 'product')
      .leftJoin('product.company', 'company')
      .select('company.id', 'companyId')
      .addSelect('COUNT(reservation.id)', 'totalReservations')
      .groupBy('company.id')
      .orderBy('totalReservations', 'DESC')
      .offset(skip)
      .limit(limit)
      .getRawMany();

    if (!hotelStats.length) {
      return {
        message: await this.i18n.translate('reservation.most_visited_hotels_fetched', lang),
        data: { data: [], total: 0, page, limit },
      };
    }

    const companyIds = hotelStats.map((h) => h.companyId);
    const hotels = await this.companyRepo.find({
      where: { id: In(companyIds) },
      relations: {
        city: true,
        country: true,
        products: {
          images: true,
          category: true,
          measure: true,
          brand: true,
          specificationValues: { specification: true },
        },
      },
    });

    const roomStats = await this.reservationRepo
      .createQueryBuilder('reservation')
      .select('reservation.productId', 'productId')
      .addSelect('COUNT(reservation.id)', 'totalReservations')
      .groupBy('reservation.productId')
      .getRawMany();

    const data = hotels.map((hotel) => {
      const hotelStat = hotelStats.find((h) => h.companyId === hotel.id);
      const rooms = hotel.products.map((room) => ({
        ...room,
        totalReservations: Number(roomStats.find((r) => r.productId === room.id)?.totalReservations) || 0,
      }));
      return {
        ...hotel,
        totalReservations: Number(hotelStat?.totalReservations) || 0,
        rooms,
      };
    });

    data.sort((a, b) => b.totalReservations - a.totalReservations);

    return {
      message: await this.i18n.translate('reservation.most_visited_hotels_fetched', lang),
      data: { data, total: data.length, page, limit },
    };
  }

  async getReservationById(id: string, lang: string = 'fr') {
    const reservation = await this.reservationRepo.findOne({
      where: { id },
      relations: [
        'user',
        'product',
        'product.company',
        'product.company.city',
        'product.company.country',
        'product.category',
        'product.brand',
        'product.images',
        'product.measure',
        'product.rentalContracts',
        'product.saleTransactions',
        'product.specificationValues',
        'product.productAttributes',
        'product.variations',
        'product.attributes',
        'product.wishlist',
        'product.availability',
        'product.reservations',
      ],
    });
    if (!reservation) throw new NotFoundException(await this.i18n.translate('reservation.error.not_found', lang, { id }));
    reservation.user = sanitizeUser(reservation.user);
    return {
      message: await this.i18n.translate('reservation.found', lang),
      data: reservation,
    };
  }

  async rejectReservation(id: string, reason: string, lang: string = 'fr') {
    const reservation = await this.reservationRepo.findOne({
      where: { id },
      relations: [
        'product',
        'product.company',
        'product.category',
        'product.brand',
        'product.images',
        'product.measure',
        'product.rentalContracts',
        'product.saleTransactions',
        'product.specificationValues',
        'product.productAttributes',
        'product.variations',
        'product.attributes',
        'product.wishlist',
        'product.availability',
        'product.reservations',
        'user',
      ],
    });
    if (!reservation) throw new NotFoundException(await this.i18n.translate('reservation.error.not_found', lang, { id }));
    if (reservation.status !== ReservationStatus.PENDING)
      throw new BadRequestException(await this.i18n.translate('reservation.error.cannot_reject', lang));

    reservation.status = ReservationStatus.REJECTED;
    reservation.reason = reason;
    const data = await this.reservationRepo.save(reservation);
    await this.updateAvailabilityRange(
      reservation.product.id,
      new Date(reservation.startDate),
      new Date(reservation.endDate),
      -reservation.roomsBooked,
    );
    return {
      message: await this.i18n.translate('reservation.rejected_success', lang),
      data,
    };
  }

  async cancelReservation(id: string, userId: string, reason: string, lang: string = 'fr') {
    const reservation = await this.reservationRepo.findOne({
      where: { id, user: { id: userId } },
      relations: ['product', 'user', 'product.availability'],
    });
    if (!reservation) throw new NotFoundException(await this.i18n.translate('reservation.error.not_found', lang, { id }));

    const now = new Date();
    const startDate = new Date(reservation.startDate);
    const diffMs = startDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours > 24) {
      throw new BadRequestException(await this.i18n.translate('reservation.error.cancel_too_early', lang));
    }

    if (![ReservationStatus.PENDING, ReservationStatus.CONFIRMED].includes(reservation.status)) {
      throw new BadRequestException(await this.i18n.translate('reservation.error.cannot_cancel', lang));
    }

    reservation.status = ReservationStatus.CANCELLED;
    reservation.reason = reason;
    if (reservation.roomsBooked) {
      await this.updateAvailabilityRange(
        reservation.product.id,
        new Date(reservation.startDate),
        new Date(reservation.endDate),
        -reservation.roomsBooked,
      );
    }
    const data = await this.reservationRepo.save(reservation);
    return {
      message: await this.i18n.translate('reservation.cancelled_success', lang),
      data,
    };
  }

  async updateReservationStatus(
    id: string,
    dto: UpdateReservationStatusDto,
    lang: string = 'fr',
  ): Promise<{ message: string; data: Reservation }> {
    const reservation = await this.reservationRepo.findOne({
      where: { id },
      relations: ['product', 'user', 'product.availability'],
    });
    if (!reservation) throw new NotFoundException(await this.i18n.translate('reservation.error.not_found', lang, { id }));

    if (!isValidReservationStatusTransition(reservation.status, dto.status)) {
      throw new BadRequestException(
        await this.i18n.translate('reservation.error.invalid_status_transition', lang, {
          from: reservation.status,
          to: dto.status,
        }),
      );
    }

    reservation.status = dto.status;

    if (dto.status === ReservationStatus.REJECTED) {
      reservation.specialRequest = 'Réservation rejetée';
      if (reservation.roomsBooked) {
        await this.updateAvailabilityRange(
          reservation.product.id,
          new Date(reservation.startDate),
          new Date(reservation.endDate),
          -reservation.roomsBooked,
        );
      }
    }

    if (dto.status === ReservationStatus.CONFIRMED) {
      const hasEmail = reservation.user.email?.trim();
      const hasPhone = reservation.user.phone?.trim();
      if (!hasEmail && !hasPhone) {
        throw new BadRequestException(await this.i18n.translate('reservation.error.no_contact_method', lang));
      }
      if (hasEmail) {
        await this.mailService.sendReservationPdf(
          reservation.user.email,
          await this.i18n.translate('reservation.email.confirmed_subject', lang),
          {
            user: reservation.user,
            reservation: {
              id: reservation.id,
              invoiceNumber: reservation.invoiceNumber,
              productName: reservation.product.name,
              productPrice: reservation.product.gros ?? 0,
              startDate: reservation.startDate,
              endDate: reservation.endDate,
              totalPrice: reservation.totalPrice,
              adults: reservation.adults,
              children: reservation.children,
              roomsBooked: reservation.roomsBooked,
              status: reservation.status,
            },
          },
        );
      }
      if (hasPhone) {
        const message = await this.i18n.translate('reservation.sms.confirmed_body', lang, {
          productName: reservation.product.name,
          startDate: reservation.startDate,
          endDate: reservation.endDate,
          totalPrice: reservation.totalPrice,
        });
        await this.smsHelper.sendSms(reservation.user.phone, message);
      }
    }

    const data = await this.reservationRepo.save(reservation);
    return {
      message: await this.i18n.translate('reservation.status_updated', lang),
      data,
    };
  }

  private listDates(start: string, end: string): string[] {
    const res: string[] = [];
    const s = new Date(start);
    const e = new Date(end);
    for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) {
      res.push(d.toISOString().slice(0, 10));
    }
    return res;
  }

  private prepareSearchTerms(destination: string): string[] {
    const cleaned = destination
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s,.-]/g, '')
      .trim();
    const terms = cleaned
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    return terms;
  }

 async searchProductsByDestination(
    params: {
      destination?: string;
      startDate?: string;
      endDate?: string;
      adults?: number;
      children?: number;
      rooms?: number;
      page?: number;
      limit?: number;
    },
    lang: string = 'fr',
  ) {
    const { destination, startDate, endDate, adults = 1, children = 0, rooms = 1, page = 1, limit = 10 } = params;
    const skip = (page - 1) * limit;

    // Normalisation de la destination
    let normalizedDestination: string | undefined;
    if (destination) {
      normalizedDestination = destination.split(',')[0].trim().toLowerCase();
    }

    const queryBuilder = this.companyRepo
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.products', 'product')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('specificationValues.specification', 'specification')
      .leftJoinAndSelect('product.productAttributes', 'productAttributes')
      .leftJoinAndSelect('product.variations', 'variations')
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('product.availability', 'availability')
      .where('company.typeCompany = :type', { type: CompanyType.HOTEL })
      .andWhere('company.status = :status', { status: CompanyStatus.VALIDATED }); // ✅ Utilisation correcte

    if (normalizedDestination) {
      queryBuilder.andWhere(
        `(LOWER(city.name) = :dest OR 
          LOWER(company.companyName) LIKE :destLike OR 
          LOWER(company.address) LIKE :destLike OR 
          LOWER(company.companyAddress) LIKE :destLike)`,
        { dest: normalizedDestination, destLike: `%${normalizedDestination}%` },
      );
    }

    const total = await queryBuilder.getCount();
    queryBuilder.skip(skip).take(limit).orderBy('product.gros', 'ASC');
    let companies = await queryBuilder.getMany();

    // Fallback si aucun résultat
    if (companies.length === 0 && normalizedDestination) {
      const simplifiedQueryBuilder = this.companyRepo
        .createQueryBuilder('company')
        .leftJoinAndSelect('company.city', 'city')
        .leftJoinAndSelect('company.products', 'product')
        .leftJoinAndSelect('product.images', 'images')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.brand', 'brand')
        .leftJoinAndSelect('product.measure', 'measure')
        .leftJoinAndSelect('product.specificationValues', 'specificationValues')
        .leftJoinAndSelect('product.productAttributes', 'productAttributes')
        .leftJoinAndSelect('product.variations', 'variations')
        .leftJoinAndSelect('product.attributes', 'attributes')
        .leftJoinAndSelect('product.availability', 'availability')
        .where('company.typeCompany = :type', { type: CompanyType.HOTEL })
        .andWhere('company.status = :status', { status: CompanyStatus.VALIDATED })
        .andWhere(
          `(LOWER(company.companyName) LIKE :dest OR 
            LOWER(company.address) LIKE :dest OR 
            LOWER(company.companyAddress) LIKE :dest)`,
          { dest: `%${normalizedDestination}%` },
        );
      const simplifiedCompanies = await simplifiedQueryBuilder
        .skip(skip)
        .take(limit)
        .orderBy('product.gros', 'ASC')
        .getMany();
      companies = simplifiedCompanies;
    }

    // Traitement des produits (capacité, disponibilité, etc.)
    const companiesWithProducts: any[] = [];
    for (const company of companies) {
      if (!company.products || company.products.length === 0) continue;
      const products: any[] = [];

      for (const product of company.products) {
        // Calcul de capacité
        const capacityAdults = product.capacityAdults || 0;
        const capacityChildren = product.capacityChildren || 0;
        const capacityTotal = product.capacityTotal || 0;
        const hasNoCapacityData = capacityAdults === 0 && capacityChildren === 0 && capacityTotal === 0;
        const canAccommodateByTotal = capacityTotal > 0 && adults + children <= capacityTotal;
        const canAccommodateBySeparate = capacityAdults > 0 && capacityChildren > 0 && adults <= capacityAdults && children <= capacityChildren;
        const capacityInfo = {
          canAccommodate: hasNoCapacityData || canAccommodateByTotal || canAccommodateBySeparate,
          hasNoCapacityData,
          canAccommodateByTotal,
          canAccommodateBySeparate,
          requiredAdults: adults,
          requiredChildren: children,
          productCapacityAdults: capacityAdults,
          productCapacityChildren: capacityChildren,
          productCapacityTotal: capacityTotal,
        };

        // Vérification de disponibilité
        let isAvailable = true;
        let availabilityInfo: any = null;
        if (startDate && endDate) {
          const availabilities = await this.availabilityRepo.find({
            where: { product: { id: product.id }, date: Between(startDate, endDate) },
          });
          if (!availabilities || availabilities.length === 0) {
            isAvailable = false;
            availabilityInfo = {
              available: false,
              message: await this.i18n.translate('reservation.search.no_availability', lang),
              period: { startDate, endDate },
            };
          } else {
            const start = new Date(startDate);
            const end = new Date(endDate);
            const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24));
            let allDaysAvailable = true;
            const unavailableDates: string[] = [];
            for (let i = 0; i < daysDiff; i++) {
              const currentDate = new Date(start);
              currentDate.setDate(start.getDate() + i);
              const dateStr = currentDate.toISOString().split('T')[0];
              const dayAvailability = availabilities.find((a) => a.date === dateStr);
              let roomsRemaining = 0;
              if (dayAvailability) {
                roomsRemaining = dayAvailability.roomsRemaining ?? (dayAvailability.roomsAvailable - (dayAvailability.roomsBooked ?? 0));
              }
              roomsRemaining = roomsRemaining ?? 0;
              if (!dayAvailability || roomsRemaining < rooms) {
                allDaysAvailable = false;
                unavailableDates.push(dateStr);
              }
            }
            if (!allDaysAvailable) {
              isAvailable = false;
              availabilityInfo = {
                available: false,
                message: await this.i18n.translate('reservation.search.some_dates_unavailable', lang),
                period: { startDate, endDate },
                unavailableDates,
              };
            } else {
              availabilityInfo = {
                available: true,
                message: await this.i18n.translate('reservation.search.available', lang),
                period: { startDate, endDate },
                roomsRemaining: Math.min(...availabilities.map((a) => a.roomsRemaining ?? a.roomsAvailable - a.roomsBooked)),
              };
            }
          }
        } else {
          availabilityInfo = { available: true, message: await this.i18n.translate('reservation.search.no_dates', lang) };
        }

        // Construction des images, spécifications, disponibilités
        const productImages = product.images?.map((img) => ({ id: img.id, url: img.url })) || [];
        const specifications = product.specificationValues?.map((sv) => ({
          id: sv.id,
          value: sv.value,
          specification: sv.specification ? {
            id: sv.specification.id,
            key: sv.specification.key,
            label: sv.specification.label,
            image: sv.specification.image,
            type: sv.specification.type,
            unit: sv.specification.unit,
            options: sv.specification.options,
            deleted: sv.specification.deleted,
            status: sv.specification.status,
            createdAt: sv.specification.createdAt,
            updatedAt: sv.specification.updatedAt,
          } : null,
        })) || [];
        const availability = product.availability?.map((avail) => ({
          id: avail.id,
          date: avail.date,
          roomsAvailable: avail.roomsAvailable,
          roomsBooked: avail.roomsBooked,
          roomsRemaining: avail.roomsRemaining,
        })) || [];

        products.push({
          ...product,
          images: productImages,
          specificationValues: specifications,
          availability,
          capacityStatus: capacityInfo,
          availabilityStatus: availabilityInfo,
          isAvailable: capacityInfo.canAccommodate && isAvailable,
          canAccommodate: capacityInfo.canAccommodate,
          hasAvailability: isAvailable,
        });
      }

      if (products.length > 0) {
        products.sort((a, b) => (a.gros || 0) - (b.gros || 0));
        companiesWithProducts.push({ ...company, products });
      }
    }

    const totalPages = Math.ceil(total / limit);
    const message = await this.i18n.translate('reservation.search.results', lang, { destination: destination || 'toutes destinations' });
    return {
      message,
      data: {
        data: companiesWithProducts,
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async getAvailableRoomsByCompany(companyId: string, lang: string = 'fr'): Promise<{ message: string; data: any[] }> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
      select: ['id', 'companyName'],
    });
    if (!company) {
      throw new NotFoundException(await this.i18n.translate('reservation.error.company_not_found', lang, { id: companyId }));
    }

    const products = await this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('category.specifications', 'categorySpec')
      .leftJoinAndSelect('categorySpec.specification', 'spec')
      .leftJoinAndSelect('product.specificationValues', 'specValues')
      .leftJoinAndSelect('specValues.specification', 'specValuesSpec')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.measure', 'measure')
      .leftJoinAndSelect('product.availability', 'availability')
      .where('product.companyId = :companyId', { companyId })
      .orderBy('product.createdAt', 'DESC')
      .addOrderBy('availability.date', 'ASC')
      .getMany();

    if (!products || products.length === 0) {
      return {
        message: await this.i18n.translate('reservation.no_rooms_found', lang),
        data: [],
      };
    }

    const formattedProducts = products.map((product) => {
      const categorySpecs: Array<any> = [];
      if (product.category?.specifications) {
        const filteredSpecs = product.category.specifications
          .filter((cs) => cs.specification)
          .map((cs) => ({
            id: cs.id,
            required: cs.required,
            displayOrder: cs.displayOrder || 0,
            specification: {
              id: cs.specification!.id,
              key: cs.specification!.key,
              label: cs.specification!.label,
              type: cs.specification!.type,
              unit: cs.specification!.unit,
              options: cs.specification!.options,
            },
          }))
          .sort((a, b) => a.displayOrder - b.displayOrder);
        categorySpecs.push(...filteredSpecs);
      }

      const productSpecs = product.specificationValues
        ?.filter((sv) => sv.specification)
        .map((sv) => ({
          id: sv.id,
          value: sv.value,
          specification: {
            id: sv.specification!.id,
            key: sv.specification!.key,
            label: sv.specification!.label,
            type: sv.specification!.type,
          },
        })) || [];

      const productImages = product.images?.map((img) => ({
        id: img.id.toString(),
        url: img.url,
      })) || [];

      const availabilityList = product.availability || [];
      const availableRooms = availabilityList.reduce((sum, av) => sum + av.roomsRemaining, 0);
      const hasAvailability = availableRooms > 0;

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        gros: product.gros,
        quantity: product.quantity,
        image: product.image,
        status: product.status,
        capacityAdults: product.capacityAdults,
        capacityChildren: product.capacityChildren,
        capacityTotal: product.capacityTotal,
        bedTypes: product.bedTypes,
        localization: product.localization,
        category: product.category ? {
          id: product.category.id,
          name: product.category.name,
          image: product.category.image,
          slug: product.category.slug,
          specifications: categorySpecs,
        } : null,
        specifications: productSpecs,
        images: productImages,
        measure: product.measure ? {
          id: product.measure.id,
          name: product.measure.name,
          abbreviation: product.measure.abbreviation,
        } : null,
        availableRooms,
        isAvailable: hasAvailability,
      };
    });

    const availableProducts = formattedProducts.filter((product) => product.isAvailable);
    const message = availableProducts.length > 0
      ? await this.i18n.translate('reservation.rooms_available', lang, { count: availableProducts.length, companyName: company.companyName })
      : await this.i18n.translate('reservation.no_rooms_available', lang, { companyName: company.companyName });

    return { message, data: availableProducts };
  }
}