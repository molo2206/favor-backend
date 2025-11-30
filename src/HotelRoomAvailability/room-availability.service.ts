import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Like, Repository } from 'typeorm';
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
  ) {}

  // -------------------------------
  // CREATE / UPDATE AVAILABILITY
  // -------------------------------
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
      roomsBooked: number;
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

    const dates = this.listDates(dto.startDate, dto.endDate);
    const DEFAULT_ROOMS_AVAILABLE = 10;

    // 🔴 CORRECTION : Stocker les disponibilités à mettre à jour
    const availabilityRecords: RoomAvailability[] = [];

    // 🔴 VÉRIFICATION : Vérifier/créer la disponibilité pour chaque date
    for (const date of dates) {
      let availability = await this.availabilityRepo.findOne({
        where: { product: { id: dto.productId }, date },
      });

      // Si la disponibilité n'existe pas, la créer
      if (!availability) {
        availability = this.availabilityRepo.create({
          product,
          date,
          roomsAvailable: DEFAULT_ROOMS_AVAILABLE,
          roomsBooked: 0,
          roomsRemaining: DEFAULT_ROOMS_AVAILABLE,
        });
        // 🔴 CORRECTION : Sauvegarder immédiatement la nouvelle disponibilité
        availability = await this.availabilityRepo.save(availability);
      }

      // Vérifier la disponibilité
      if (availability.roomsAvailable < dto.roomsBooked) {
        throw new BadRequestException(
          `Désolé, il ne reste que ${availability.roomsAvailable} chambre(s) disponible(s) pour le ${date}. Vous avez demandé ${dto.roomsBooked} chambre(s).`,
        );
      }

      // Mettre à jour la disponibilité
      availability.roomsAvailable -= dto.roomsBooked;
      availability.roomsBooked += dto.roomsBooked;
      availability.roomsRemaining = availability.roomsAvailable;

      availabilityRecords.push(availability);
    }

    // 🔴 CORRECTION : Sauvegarder toutes les disponibilités en une fois
    await this.availabilityRepo.save(availabilityRecords);

    // Calcul du prix et création réservation
    const calculatedTotalPrice = PriceCalculator.calculateTotalPrice(
      product,
      dto.startDate,
      dto.endDate,
      dto.roomsBooked,
      dto.quantity,
    );

    const reservation = this.reservationRepo.create({
      user,
      product,
      startDate: dto.startDate,
      endDate: dto.endDate,
      adults: dto.adults,
      children: dto.children,
      roomsBooked: dto.roomsBooked,
      quantity: dto.quantity ?? dto.roomsBooked,
      totalPrice: calculatedTotalPrice,
      specialRequest: dto.specialRequest,
    });

    const saved = await this.reservationRepo.save(reservation);

    return {
      message: 'Réservation confirmée avec succès',
      data: saved,
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

  async searchProductsByDestination({
    destination,
    startDate,
    endDate,
    adults = 1,
    children = 0,
    rooms = 1,
  }: {
    destination?: string;
    startDate?: string;
    endDate?: string;
    adults?: number;
    children?: number;
    rooms?: number;
  }) {
    // Construction du query builder pour les companies AVEC LES RELATIONS
    const queryBuilder = this.companyRepo
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.products', 'product')
      .where('company.typeCompany = :type', { type: CompanyType.HOTEL });

    // Filtre par destination
    if (destination) {
      const search = `%${destination.toLowerCase()}%`;
      queryBuilder.andWhere(
        `(
        LOWER(city.name) LIKE :search
        OR LOWER(country.name) LIKE :search
        OR LOWER(company.companyName) LIKE :search
        OR LOWER(company.address) LIKE :search
        OR LOWER(company.companyAddress) LIKE :search
      )`,
        { search },
      );
    }

    const companies = await queryBuilder.getMany();
    const companiesWithProducts: any[] = [];

    for (const company of companies) {
      if (!company.products || company.products.length === 0) continue;

      const products: any[] = [];

      for (const product of company.products) {
        console.log(
          `Produit: ${product.name}, Adults: ${product.capacityAdults}, Children: ${product.capacityChildren}, Total: ${product.capacityTotal}`,
        );

        // LOGIQUE DE CAPACITÉ AMÉLIORÉE
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

        if (hasNoCapacityData || canAccommodateByTotal || canAccommodateBySeparate) {
          console.log(
            `✅ Produit ${product.name} peut accueillir ${adults} adultes et ${children} enfants`,
          );

          let isAvailable = true;
          if (startDate && endDate) {
            const availabilities = await this.availabilityRepo.find({
              where: {
                product: { id: product.id },
                date: Between(startDate, endDate),
              },
            });

            if (!availabilities || availabilities.length === 0) {
              isAvailable = false;
              console.log(`❌ Aucune disponibilité pour ${product.name}`);
            } else {
              const start = new Date(startDate);
              const end = new Date(endDate);
              const daysDiff = Math.ceil(
                (end.getTime() - start.getTime()) / (1000 * 3600 * 24),
              );

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
                  isAvailable = false;
                  console.log(
                    `❌ Plus de chambres disponibles le ${dateStr} pour ${product.name}`,
                  );
                  break;
                }
              }
            }
          }

          if (isAvailable) {
            // Ajouter le produit avec TOUS LES CHAMPS IMPORTANTS
            products.push({
              // Informations de base
              id: product.id,
              name: product.name,
              description: product.description,
              price: product.price,
              type: product.type,

              // Prix et variations
              detail_price_original: product.detail_price_original,
              gros_price_original: product.gros_price_original,
              detail: product.detail,
              gros: product.gros,
              dailyRate: product.dailyRate,
              salePrice: product.salePrice,

              // Capacités
              capacityAdults: product.capacityAdults,
              capacityChildren: product.capacityChildren,
              capacityTotal: product.capacityTotal,
              bedTypes: product.bedTypes,

              // Caractéristiques
              ingredients: product.ingredients,
              quantity: product.quantity,
              min_quantity: product.min_quantity,
              stockAlert: product.stockAlert,

              // Images et médias
              image: product.image,
              images: product.images,

              // Localisation
              localization: product.localization,

              // Statut et métadonnées
              status: product.status,
              companyActivity: product.companyActivity,
              createdAt: product.createdAt,
              updatedAt: product.updatedAt,

              // Spécifications voiture (si applicable)
              registrationNumber: product.registrationNumber,
              model: product.model,
              year: product.year,
              typecar: product.typecar,
              fuelType: product.fuelType,
              transmission: product.transmission,
              color: product.color,
              dailyRate_price_original: product.dailyRate_price_original,

              // Relations (simplifiées)
              category: product.category,
              brand: product.brand,
              measure: product.measure,
            });
            console.log(`✅ ${product.name} ajouté aux produits de ${company.companyName}`);
          }
        } else {
          console.log(`❌ Capacité insuffisante pour ${product.name}`);
        }
      }

      // Si la company a au moins un produit disponible, l'ajouter aux résultats
      if (products.length > 0) {
        companiesWithProducts.push({
          id: company.id,
          companyName: company.companyName,
          companyAddress: company.companyAddress,
          address: company.address,
          email: company.email,
          phone: company.phone,
          website: company.website,
          latitude: company.latitude,
          longitude: company.longitude,
          city: company.city,
          country: company.country,
          products: products,
        });
      }
    }

    return {
      message: `Produits disponibles récupérés pour la destination : ${destination}`,
      data: companiesWithProducts,
    };
  }
}
