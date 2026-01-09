import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Like, Repository } from 'typeorm';
import { RoomAvailability } from './entity/RoomAvailability.entity';
import { Product } from 'src/products/entities/product.entity';
import { Reservation } from './entity/Reservation.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { CreateRoomAvailabilityDto } from './dto/create-room-availability-dto';
import { classToPlain } from 'class-transformer';
import { PriceCalculator } from 'src/users/utility/helpers/price-calculator.util';
import { SearchRoomsDto } from './dto/search-room-dtod';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { ImageProductEntity } from 'src/products/entities/imageProduct.entity';
import { ProductSpecificationValue } from 'src/specification/entities/ProductSpecificationValue.entity';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import { MailOrderService } from 'src/email/emailorder.service';
import { InvoiceService } from 'src/order/invoice/invoice.util';
import { ReservationStatus } from './enum/reservation-room.enum';
import { UpdateReservationStatusDto } from './dto/update-reservation-status.dto';
import { isValidReservationStatusTransition } from 'src/users/utility/helpers/reservation-status.util';
import { sanitizeUser } from 'src/users/utility/helpers/anitizeUser.util';
import { LessThanOrEqual, MoreThanOrEqual } from 'typeorm';

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
  ) {}

  async create(dto: CreateRoomAvailabilityDto) {
    const product = await this.productRepo.findOne({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product (room type) not found');

    const existing = await this.availabilityRepo.findOne({
      where: { product: { id: dto.productId }, date: dto.date },
      relations: ['product'],
    });

    if (existing) {
      existing.roomsAvailable = dto.roomsAvailable;
      existing.roomsRemaining = existing.roomsAvailable - (existing.roomsBooked ?? 0);
      const saved = await this.availabilityRepo.save(existing);
      return { message: 'Availability updated successfully', data: saved };
    }

    const availability = this.availabilityRepo.create({
      product,
      date: dto.date,
      roomsAvailable: dto.roomsAvailable,
      roomsBooked: dto.roomsBooked ?? 0,
      roomsRemaining: (dto.roomsAvailable ?? product.quantity) - (dto.roomsBooked ?? 0),
    });

    const saved = await this.availabilityRepo.save(availability);
    return { message: 'Availability created successfully', data: saved };
  }

  async update(id: string, changes: Partial<RoomAvailability>) {
    const existing = await this.availabilityRepo.findOne({
      where: { id },
      relations: ['product'],
    });
    if (!existing) throw new NotFoundException('Availability not found');

    Object.assign(existing, changes);
    existing.roomsRemaining = existing.roomsAvailable - existing.roomsBooked;

    const saved = await this.availabilityRepo.save(existing);
    return { message: 'Availability updated successfully', data: saved };
  }

  async updateAvailabilityRange(
    productId: string,
    startDate: Date,
    endDate: Date,
    roomsChange: number,
  ) {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    const dates = this.getDateRange(startDate, endDate);
    const updatedAvailabilities: RoomAvailability[] = []; // ✅ typer le tableau

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

    return { message: 'Availabilities updated successfully', data: updatedAvailabilities };
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
  async findForProductBetween(productId: string, from: string, to: string) {
    const data = await this.availabilityRepo
      .createQueryBuilder('a')
      .where('a.productId = :productId', { productId })
      .andWhere('a.date >= :from AND a.date <= :to', { from, to })
      .orderBy('a.date', 'ASC')
      .getMany();

    return { message: 'Availability fetched successfully', data };
  }

  async generateCalendar(productId: string, from: string, to: string) {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

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
    return { message: 'Calendar generated successfully', data: { created: toSave.length } };
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
  ) {
    const product = await this.productRepo.findOne({
      where: { id: dto.productId },
      select: ['id', 'price', 'detail', 'gros', 'dailyRate', 'salePrice', 'name'],
    });
    if (!product) throw new NotFoundException('Type de chambre non trouvé');

    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'fullName', 'email', 'phone', 'image', 'role', 'country', 'city'],
    });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    const overlappingReservation = await this.reservationRepo.findOne({
      where: {
        product: { id: dto.productId },
        startDate: LessThanOrEqual(dto.endDate),
        endDate: MoreThanOrEqual(dto.startDate),
      },
    });

    if (overlappingReservation) {
      throw new BadRequestException(
        `Impossible de réserver : les dates ${dto.startDate} - ${dto.endDate} sont déjà prises pour cette chambre.`,
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
          `Désolé, il ne reste que ${availability.roomsAvailable} chambre(s) disponible(s) pour le ${date}. Vous avez demandé ${roomsToBook} chambre(s).`,
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
        'Aucun moyen de contact disponible (ni email, ni numéro de téléphone).',
      );
    }

    if (hasEmail) {
      await this.mailService.sendReservationPdf(
        user.email,
        'Confirmation de réservation - FavorHelp',
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
      const message = `Votre réservation (${product.name}) du ${dto.startDate} au ${dto.endDate} a été effectuée avec succès sur FavorHelp.
Montant total : ${calculatedTotalPrice} USD.
Pour le paiement, vous pouvez faire un retrait sur ce numéro agent : +243 962 646 653 (Nom affiché : Kavira Naomi).
Ou effectuer un dépôt bancaire Equity : 688200060761632.
Merci pour votre confiance. Votre réservation sera confirmée après réception du paiement.`;

      await this.smsHelper.sendSms(user.phone, message);
    }

    return {
      message: 'Réservation confirmée avec succès',
      data: saved,
    };
  }

  async getUserReservations(userId: string, filters?: { page?: number; limit?: number }) {
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
      message: 'Liste des réservations de l’utilisateur récupérée avec succès.',
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

    if (status) {
      query.andWhere('reservation.status = :status', { status });
    }

    if (startDate) {
      query.andWhere('reservation.startDate >= :startDate', { startDate });
    }

    if (endDate) {
      query.andWhere('reservation.endDate <= :endDate', { endDate });
    }

    const [data, total] = await query.getManyAndCount();

    data.forEach((reservation) => {
      reservation.user = sanitizeUser(reservation.user);
    });

    return {
      message: 'Liste des réservations de la société récupérée avec succès.',
      data: {
        data,
        total,
        page,
        limit,
      },
    };
  }

  async getAllReservations() {
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

      .leftJoinAndSelect('product.rentalContracts', 'rentalContracts')
      .leftJoinAndSelect('product.saleTransactions', 'saleTransactions')

      .leftJoinAndSelect('product.specificationValues', 'specificationValues')
      .leftJoinAndSelect('product.productAttributes', 'productAttributes')
      .leftJoinAndSelect('product.variations', 'variations')
      .leftJoinAndSelect('product.attributes', 'attributes')

      .leftJoinAndSelect('product.wishlist', 'wishlist')
      .leftJoinAndSelect('product.availability', 'availability')

      .orderBy('reservation.createdAt', 'DESC')
      .getMany();

    data.forEach((reservation) => {
      if (reservation.user) {
        reservation.user = sanitizeUser(reservation.user);
      }
    });

    return {
      message: 'Liste de toutes les réservations récupérée avec succès.',
      data,
      total: data.length,
    };
  }

  async getMostVisitedHotels(page = 1, limit = 10) {
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
        message: 'Liste des hôtels les plus visités',
        data: {
          data: [],
          total: 0,
          page,
          limit,
        },
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
          specificationValues: {
            specification: true, // valeur + définition
          },
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
        totalReservations:
          Number(roomStats.find((r) => r.productId === room.id)?.totalReservations) || 0,
      }));

      return {
        ...hotel,
        totalReservations: Number(hotelStat?.totalReservations) || 0,
        rooms,
      };
    });

    data.sort((a, b) => b.totalReservations - a.totalReservations);

    return {
      message: 'Liste des hôtels les plus visités',
      data: {
        data,
        total: data.length,
        page,
        limit,
      },
    };
  }

  async getReservationById(id: string) {
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

    if (!reservation) throw new NotFoundException('Réservation introuvable.');

    reservation.user = sanitizeUser(reservation.user);

    return {
      message: 'Réservation récupérée avec succès.',
      data: reservation,
    };
  }

  async rejectReservation(id: string, reason: string) {
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

    if (!reservation) throw new NotFoundException('Réservation introuvable.');

    if (reservation.status !== ReservationStatus.PENDING)
      throw new BadRequestException('Impossible de rejeter cette réservation.');

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
      message: 'Réservation rejetée avec succès.',
      data,
    };
  }

  async cancelReservation(id: string, userId: string, reason: string) {
    const reservation = await this.reservationRepo.findOne({
      where: { id, user: { id: userId } },
      relations: ['product', 'user', 'product.availability'],
    });

    if (!reservation) throw new NotFoundException('Réservation introuvable.');

    // Vérifie que la réservation est annulable (moins de 24h avant le début)
    const now = new Date();
    const startDate = new Date(reservation.startDate);
    const diffMs = startDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    // Autoriser l'annulation uniquement si moins de 24h avant le début
    if (diffHours > 24) {
      throw new BadRequestException(
        'Impossible d’annuler la réservation plus de 24h avant le début.',
      );
    }

    if (
      ![ReservationStatus.PENDING, ReservationStatus.CONFIRMED].includes(reservation.status)
    ) {
      throw new BadRequestException('Cette réservation ne peut pas être annulée.');
    }

    reservation.status = ReservationStatus.CANCELLED;
    reservation.reason = reason;

    // Restitution des rooms
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
      message: 'Réservation annulée avec succès.',
      data,
    };
  }

  async updateReservationStatus(
    id: string,
    dto: UpdateReservationStatusDto,
  ): Promise<{ message: string; data: Reservation }> {
    const reservation = await this.reservationRepo.findOne({
      where: { id },
      relations: ['product', 'user', 'product.availability'],
    });

    if (!reservation) throw new NotFoundException('Réservation introuvable.');

    // Vérifie la validité de la transition
    if (!isValidReservationStatusTransition(reservation.status, dto.status)) {
      throw new BadRequestException(
        `Transition invalide de "${reservation.status}" vers "${dto.status}".`,
      );
    }

    reservation.status = dto.status;

    // Si la réservation est REJECTED
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

    // Si la réservation est VALIDATED
    if (dto.status === ReservationStatus.CONFIRMED) {
      const hasEmail = reservation.user.email?.trim();
      const hasPhone = reservation.user.phone?.trim();

      if (!hasEmail && !hasPhone) {
        throw new BadRequestException(
          'Aucun moyen de contact disponible (ni email, ni numéro de téléphone).',
        );
      }

      if (hasEmail) {
        await this.mailService.sendReservationPdf(
          reservation.user.email,
          'Réservation validée - FavorHelp',
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
        const message = `Votre réservation (${reservation.product.name}) du ${reservation.startDate} au ${reservation.endDate} a été validée avec succès sur FavorHelp.
Montant total payé : ${reservation.totalPrice} USD.
Merci pour votre confiance. Votre réservation est confirmée.`;

        await this.smsHelper.sendSms(reservation.user.phone, message);
      }
    }

    const data = await this.reservationRepo.save(reservation);

    return {
      message: 'Statut de la réservation mis à jour avec succès.',
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
    // Normalise et nettoie la chaîne
    const cleaned = destination
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // retire accents
      .replace(/[^a-z0-9\s,.-]/g, '') // conserve lettres, chiffres, espaces, virgules, points et tirets
      .trim();

    // Séparer par virgule pour chaque ville/pays
    const terms = cleaned
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    console.log(`Destination input: "${destination}"`);
    console.log(`Cleaned: "${cleaned}"`);
    console.log(`Terms extracted:`, terms);

    return terms;
  }
  private buildFlexibleSearchConditions(searchTerms: string[]): string[] {
    const conditions: string[] = [];

    searchTerms.forEach((_, i) => {
      conditions.push(`LOWER(company.companyName) LIKE :term${i}`);
      conditions.push(`LOWER(company.address) LIKE :term${i}`);
      conditions.push(`LOWER(company.companyAddress) LIKE :term${i}`);
      conditions.push(`LOWER(city.name) LIKE :term${i}`);
      conditions.push(`LOWER(country.name) LIKE :term${i}`);
    });

    return conditions;
  }

  private buildSearchParameters(searchTerms: string[]): any {
    const parameters: { [key: string]: string } = {};
    searchTerms.forEach((term, i) => {
      parameters[`term${i}`] = `%${term}%`;
    });
    return parameters;
  }

  async searchProductsByDestination({
    destination,
    startDate,
    endDate,
    adults = 1,
    children = 0,
    rooms = 1,
    page = 1,
    limit = 10,
  }: {
    destination?: string;
    startDate?: string;
    endDate?: string;
    adults?: number;
    children?: number;
    rooms?: number;
    page?: number;
    limit?: number;
  }) {
    const skip = (page - 1) * limit;

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
      .where('company.typeCompany = :type', { type: CompanyType.HOTEL });

    if (destination) {
      const searchTerms = this.prepareSearchTerms(destination);

      if (searchTerms.length > 0) {
        const termConditions: string[] = [];
        const searchParams: Record<string, string> = {};

        searchTerms.forEach((term, i) => {
          const cols = [
            `LOWER(company.companyName) LIKE LOWER(:term${i})`,
            `LOWER(company.address) LIKE LOWER(:term${i})`,
            `LOWER(company.companyAddress) LIKE LOWER(:term${i})`,
            `LOWER(city.name) LIKE LOWER(:term${i})`,
          ];

          termConditions.push(`(${cols.join(' OR ')})`);
          searchParams[`term${i}`] = `%${term}%`;
        });

        queryBuilder.andWhere(termConditions.join(' AND '), searchParams);

        console.log('Search terms:', searchTerms);
        console.log('Search params:', searchParams);
      } else {
        const normalizedTerm = destination.toLowerCase().trim();
        queryBuilder.andWhere(
          `(LOWER(company.companyName) LIKE LOWER(:term) OR 
          LOWER(company.address) LIKE LOWER(:term) OR 
          LOWER(company.companyAddress) LIKE LOWER(:term) OR 
          LOWER(city.name) LIKE LOWER(:term))`,
          { term: `%${normalizedTerm}%` },
        );
      }
    }

    console.log('Generated SQL:', await queryBuilder.getSql());
    console.log('Parameters:', await queryBuilder.getParameters());

    const total = await queryBuilder.getCount();
    console.log(`Total companies found: ${total}`);

    queryBuilder.skip(skip).take(limit).orderBy('product.gros', 'ASC');

    let companies = await queryBuilder.getMany();
    console.log(`Companies after pagination: ${companies.length}`);

    if (companies.length === 0 && destination) {
      console.log('No results with complex search. Trying simplified search...');

      const simplifiedQueryBuilder = this.companyRepo
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
        .where('company.typeCompany = :type', { type: CompanyType.HOTEL });

      const searchTerms = this.prepareSearchTerms(destination);
      if (searchTerms.length > 0) {
        const firstTerm = searchTerms[0];
        simplifiedQueryBuilder.andWhere(
          `(LOWER(company.companyName) LIKE LOWER(:term) OR 
          LOWER(company.address) LIKE LOWER(:term) OR 
          LOWER(company.companyAddress) LIKE LOWER(:term) OR 
          LOWER(city.name) LIKE LOWER(:term))`,
          { term: `%${firstTerm}%` },
        );

        console.log('Trying simplified search with term:', firstTerm);
        const simplifiedCompanies = await simplifiedQueryBuilder
          .skip(skip)
          .take(limit)
          .orderBy('product.gros', 'ASC')
          .getMany();

        console.log(`Simplified search results: ${simplifiedCompanies.length}`);

        companies = simplifiedCompanies;
      }
    }

    const companiesWithProducts: any[] = [];

    for (const company of companies) {
      if (!company.products || company.products.length === 0) continue;

      const products: any[] = [];

      for (const product of company.products) {
        const capacityAdults = product.capacityAdults || 0;
        const capacityChildren = product.capacityChildren || 0;
        const capacityTotal = product.capacityTotal || 0;

        const hasNoCapacityData =
          capacityAdults === 0 && capacityChildren === 0 && capacityTotal === 0;
        const canAccommodateByTotal = capacityTotal > 0 && adults + children <= capacityTotal;
        const canAccommodateBySeparate =
          capacityAdults > 0 &&
          capacityChildren > 0 &&
          adults <= capacityAdults &&
          children <= capacityChildren;

        const capacityInfo = {
          canAccommodate:
            hasNoCapacityData || canAccommodateByTotal || canAccommodateBySeparate,
          hasNoCapacityData,
          canAccommodateByTotal,
          canAccommodateBySeparate,
          requiredAdults: adults,
          requiredChildren: children,
          productCapacityAdults: capacityAdults,
          productCapacityChildren: capacityChildren,
          productCapacityTotal: capacityTotal,
        };

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
              message: 'Aucune disponibilité trouvée pour les dates demandées',
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
              const roomsAvailable = dayAvailability?.roomsAvailable ?? 0;
              const roomsBooked = dayAvailability?.roomsBooked ?? 0;
              const roomsRemaining =
                dayAvailability?.roomsRemaining ?? roomsAvailable - roomsBooked;

              if (!dayAvailability || roomsRemaining < rooms) {
                allDaysAvailable = false;
                unavailableDates.push(dateStr);
              }
            }

            if (!allDaysAvailable) {
              isAvailable = false;
              availabilityInfo = {
                available: false,
                message: 'Chambres non disponibles pour certaines dates',
                period: { startDate, endDate },
                unavailableDates,
              };
            } else {
              availabilityInfo = {
                available: true,
                message: 'Chambres disponibles pour toute la période',
                period: { startDate, endDate },
                roomsRemaining: Math.min(
                  ...availabilities.map(
                    (a) => a.roomsRemaining ?? a.roomsAvailable - a.roomsBooked,
                  ),
                ),
              };
            }
          }
        } else {
          availabilityInfo = {
            available: true,
            message: 'Aucune période spécifiée - vérifiez la disponibilité pour vos dates',
          };
        }

        const productImages =
          product.images?.map((img) => ({ id: img.id, url: img.url })) || [];
        const specifications =
          product.specificationValues?.map((specValue) => ({
            id: specValue.id,
            value: specValue.value,
            specification: specValue.specification
              ? {
                  id: specValue.specification.id,
                  key: specValue.specification.key,
                  label: specValue.specification.label,
                  image: specValue.specification.image,
                  type: specValue.specification.type,
                  unit: specValue.specification.unit,
                  options: specValue.specification.options,
                  deleted: specValue.specification.deleted,
                  status: specValue.specification.status,
                  createdAt: specValue.specification.createdAt,
                  updatedAt: specValue.specification.updatedAt,
                }
              : null,
          })) || [];

        const availability =
          product.availability?.map((avail) => ({
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

    return {
      message: `Produits récupérés pour la destination : ${destination}${
        startDate && endDate ? ` pour la période ${startDate} - ${endDate}` : ''
      }`,
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

  async getAvailableRoomsByCompany(
    companyId: string,
  ): Promise<{ message: string; data: any[] }> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
      select: ['id', 'companyName'],
    });

    if (!company) {
      throw new NotFoundException('Entreprise non trouvée');
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
        message: 'Aucune chambre trouvée pour cette entreprise',
        data: [],
      };
    }

    const formattedProducts = products.map((product) => {

      const categorySpecs: Array<{
        id: string;
        required: boolean;
        displayOrder: number;
        specification: {
          id: string;
          key: string;
          label: string;
          type: any;
          unit?: string;
          options?: any;
        };
      }> = [];

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

      const productSpecs: Array<{
        id: string;
        value?: string;
        specification: {
          id: string;
          key: string;
          label: string;
          type: any;
        };
      }> =
        product.specificationValues
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

      const productImages: Array<{
        id: string;
        url: string;
      }> =
        product.images?.map((img) => ({
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

        category: product.category
          ? {
              id: product.category.id,
              name: product.category.name,
              image: product.category.image,
              slug: product.category.slug,
              specifications: categorySpecs,
            }
          : null,

        specifications: productSpecs,

        images: productImages,

        measure: product.measure
          ? {
              id: product.measure.id,
              name: product.measure.name,
              abbreviation: product.measure.abbreviation,
            }
          : null,

        availableRooms: availableRooms,

        isAvailable: hasAvailability,
      };
    });

    const availableProducts = formattedProducts.filter((product) => product.isAvailable);

    return {
      message:
        availableProducts.length > 0
          ? `${availableProducts.length} chambre(s) disponible(s) trouvée(s) pour ${company.companyName}`
          : `Aucune chambre disponible pour ${company.companyName}`,
      data: availableProducts,
    };
  }
}
