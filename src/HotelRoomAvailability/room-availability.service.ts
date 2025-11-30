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
import { ImageProductEntity } from 'src/products/entities/imageProduct.entity';
import { ProductSpecificationValue } from 'src/specification/entities/ProductSpecificationValue.entity';
import { ProductAttribute } from 'src/AttributGlobal/entities/product_attributes.entity';
import { ProductVariation } from 'src/AttributGlobal/entities/product_variations.entity';
import { Country } from 'src/company/entities/country.entity';
import { City } from 'src/company/entities/city.entity';

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

  // MÉTHODES POUR LA RECHERCHE FLEXIBLE
  private prepareSearchTerms(destination: string): string[] {
    // Nettoyer la destination : supprimer les caractères spéciaux, normaliser
    const cleaned = destination
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
      .replace(/[^a-z0-9\s,]/g, '') // Garder seulement lettres, chiffres, espaces et virgules
      .trim();

    // Séparer par virgules et espaces, puis filtrer les termes vides
    const terms = cleaned.split(/[\s,]+/).filter((term) => term.length > 0);

    // Ajouter le terme complet pour les correspondances exactes
    const allTerms = [...terms, cleaned.replace(/[\s,]+/g, ' ')];

    // Retirer les doublons
    return [...new Set(allTerms)];
  }

  private buildFlexibleSearchConditions(searchTerms: string[]): string[] {
    // CORRECTION : Déclarer explicitement le type du tableau
    const conditions: string[] = [];

    for (let i = 0; i < searchTerms.length; i++) {
      const term = searchTerms[i];

      // Pour chaque terme, créer des conditions LIKE pour chaque champ
      conditions.push(`LOWER(city.name) LIKE :term${i}`);
      conditions.push(`LOWER(country.name) LIKE :term${i}`);
      conditions.push(`LOWER(company.companyName) LIKE :term${i}`);
      conditions.push(`LOWER(company.address) LIKE :term${i}`);
      conditions.push(`LOWER(company.companyAddress) LIKE :term${i}`);

      // Recherche partielle avec seulement quelques lettres
      if (term.length >= 2) {
        conditions.push(`LOWER(city.name) LIKE :partial${i}`);
        conditions.push(`LOWER(country.name) LIKE :partial${i}`);
        conditions.push(`LOWER(company.companyName) LIKE :partial${i}`);
      }
    }

    return conditions;
  }

  private buildSearchParameters(searchTerms: string[]): any {
    // CORRECTION : Déclarer explicitement le type avec index signature
    const parameters: { [key: string]: string } = {};

    for (let i = 0; i < searchTerms.length; i++) {
      const term = searchTerms[i];

      // Recherche exacte
      parameters[`term${i}`] = `%${term}%`;

      // Recherche partielle (pour termes de 2 caractères ou plus)
      if (term.length >= 2) {
        parameters[`partial${i}`] = `%${term.substring(0, 2)}%`;
      }
    }

    return parameters;
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
    // Construction du query builder pour les companies AVEC TOUTES LES RELATIONS
    const queryBuilder = this.companyRepo
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.country', 'country')
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
      .where('company.typeCompany = :type', { type: CompanyType.HOTEL });

    // FILTRE PAR DESTINATION AMÉLIORÉ ET FLEXIBLE
    if (destination) {
      // Nettoyer et préparer les termes de recherche
      const searchTerms = this.prepareSearchTerms(destination);

      // Construire la condition de recherche flexible
      const searchConditions = this.buildFlexibleSearchConditions(searchTerms);

      queryBuilder.andWhere(
        `(${searchConditions.join(' OR ')})`,
        this.buildSearchParameters(searchTerms),
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

        // TOUJOURS INCLURE LE PRODUIT MÊME SI CAPACITÉ INSUFFISANTE
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

        console.log(
          `✅ Produit ${product.name} inclus - Capacité suffisante: ${capacityInfo.canAccommodate}`,
        );

        let isAvailable = true;
        // CORRECTION : Déclarer availabilityInfo avec un type union
        let availabilityInfo: {
          available: boolean;
          message: string;
          period?: { startDate: string; endDate: string };
          unavailableDates?: string[];
          roomsRemaining?: number;
        } | null = null;

        // VÉRIFICATION DISPONIBILITÉ SEULEMENT SI DATES FOURNIES
        if (startDate && endDate) {
          const availabilities = await this.availabilityRepo.find({
            where: {
              product: { id: product.id },
              date: Between(startDate, endDate),
            },
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
                unavailableDates: unavailableDates,
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

        // STRUCTURER LES IMAGES
        const productImages = product.images
          ? product.images.map((image: ImageProductEntity) => ({
              id: image.id,
              url: image.url,
            }))
          : [];

        // STRUCTURER LES SPÉCIFICATIONS
        const specifications = product.specificationValues
          ? product.specificationValues.map((spec: ProductSpecificationValue) => ({
              id: spec.id,
              value: spec.value,
              specification: spec.specification,
            }))
          : [];

        // SUPPRIMÉ : Les attributs et variations comme demandé
        // STRUCTURER LA DISPONIBILITÉ
        const availability = product.availability
          ? product.availability.map((avail: RoomAvailability) => ({
              id: avail.id,
              date: avail.date,
              roomsAvailable: avail.roomsAvailable,
              roomsBooked: avail.roomsBooked,
              roomsRemaining: avail.roomsRemaining,
            }))
          : [];

        // AJOUTER LE PRODUIT DANS TOUS LES CAS
        products.push({
          // === CHAMPS DE BASE DU PRODUIT ===
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          type: product.type,

          // === PRIX ET VARIATIONS ===
          detail_price_original: product.detail_price_original,
          gros_price_original: product.gros_price_original,
          detail: product.detail,
          gros: product.gros,
          dailyRate: product.dailyRate,
          salePrice: product.salePrice,
          dailyRate_price_original: product.dailyRate_price_original,

          // === CAPACITÉS ET CARACTÉRISTIQUES CHAMBRE ===
          capacityAdults: product.capacityAdults,
          capacityChildren: product.capacityChildren,
          capacityTotal: product.capacityTotal,
          bedTypes: product.bedTypes,
          localization: product.localization,

          // === STOCK ET INVENTAIRE ===
          ingredients: product.ingredients,
          quantity: product.quantity,
          min_quantity: product.min_quantity,
          stockAlert: product.stockAlert,

          // === IMAGES ET MÉDIAS ===
          image: product.image,
          images: productImages,

          // === SPÉCIFICATIONS VOITURE ===
          registrationNumber: product.registrationNumber,
          model: product.model,
          year: product.year,
          typecar: product.typecar,
          fuelType: product.fuelType,
          transmission: product.transmission,
          color: product.color,

          // === STATUT ET MÉTADONNÉES ===
          status: product.status,
          companyActivity: product.companyActivity,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,

          // === RELATIONS COMPLÈTES ===
          category: product.category,
          brand: product.brand,
          measure: product.measure,

          // === COLLECTIONS ET RELATIONS MULTIPLES ===
          specificationValues: specifications,
          // SUPPRIMÉ : productAttributes, variations, attributes
          availability: availability,

          // === RELATIONS (simplifiées pour éviter la récursion) ===
          rentalContracts: product.rentalContracts ? product.rentalContracts.length : 0,
          saleTransactions: product.saleTransactions ? product.saleTransactions.length : 0,
          reservations: product.reservations ? product.reservations.length : 0,
          wishlist: product.wishlist ? product.wishlist.length : 0,

          // === INFORMATIONS DE CAPACITÉ ET DISPONIBILITÉ ===
          capacityStatus: capacityInfo,
          availabilityStatus: availabilityInfo,
          isAvailable: capacityInfo.canAccommodate && isAvailable,
          canAccommodate: capacityInfo.canAccommodate,
          hasAvailability: isAvailable,
        });
      }

      // Si la company a au moins un produit, l'ajouter aux résultats
      if (products.length > 0) {
        const companyCity = company.city
          ? {
              id: company.city.id,
              name: company.city.name,
              countryId: company.city.countryId,
              status: company.city.status,
              createdAt: company.city.createdAt,
              updatedAt: company.city.updatedAt,
            }
          : null;

        const companyCountry = company.country
          ? {
              id: company.country.id,
              name: company.country.name,
              code: company.country.code,
              status: company.country.status,
              createdAt: company.country.createdAt,
              updatedAt: company.country.updatedAt,
              cities: company.country.cities ? company.country.cities.length : 0,
            }
          : null;

        const companyCategory = company.category
          ? {
              id: company.category.id,
              name: company.category.name,
              type: company.category.type,
              image: company.category.image,
              slug: company.category.slug,
              status: company.category.status,
              createdAt: company.category.createdAt,
              updatedAt: company.category.updatedAt,
            }
          : null;

        companiesWithProducts.push({
          // === CHAMPS DE BASE DE LA COMPANY ===
          id: company.id,
          companyName: company.companyName,
          companyAddress: company.companyAddress,
          address: company.address,
          email: company.email,
          phone: company.phone,
          website: company.website,

          // === DOCUMENTS ET INFORMATIONS LÉGALES ===
          vatNumber: company.vatNumber,
          registrationDocumentUrl: company.registrationDocumentUrl,
          warehouseLocation: company.warehouseLocation,

          // === IMAGES ET MÉDIAS ===
          banner: company.banner,
          logo: company.logo,

          // === STATUT ET TYPE ===
          status: company.status,
          typeCompany: company.typeCompany,
          companyActivity: company.companyActivity,

          // === INFORMATIONS DE LOCALISATION ===
          latitude: company.latitude,
          longitude: company.longitude,
          delivery_minutes: company.delivery_minutes,
          distance_km: company.distance_km,
          open_time: company.open_time,

          // === FINANCES ET TAUX ===
          taux: company.taux,
          localCurrency: company.localCurrency,

          // === RELATIONS GÉOGRAPHIQUES ===
          city: companyCity,
          country: companyCountry,
          category: companyCategory,
          cityId: company.cityId,
          countryId: company.countryId,
          categoryId: company.categoryId,

          // === MÉTADONNÉES ===
          createdAt: company.createdAt,

          // === COLLECTIONS (compteurs pour éviter trop de données) ===
          userHasCompany: company.userHasCompany ? company.userHasCompany.length : 0,
          measures: company.measures ? company.measures.length : 0,
          services: company.services ? company.services.length : 0,
          rooms: company.rooms ? company.rooms.length : 0,
          tauxCompanies: company.tauxCompanies ? company.tauxCompanies.length : 0,

          // === TOUS LES PRODUITS ===
          products: products,
        });
      }
    }

    return {
      message: `Produits récupérés pour la destination : ${destination}${startDate && endDate ? ` pour la période ${startDate} - ${endDate}` : ''}`,
      data: companiesWithProducts,
      summary: {
        totalCompanies: companiesWithProducts.length,
        totalProducts: companiesWithProducts.reduce(
          (sum, company) => sum + company.products.length,
          0,
        ),
        availableProducts: companiesWithProducts.reduce(
          (sum, company) => sum + company.products.filter((p: any) => p.isAvailable).length,
          0,
        ),
        productsWithCapacity: companiesWithProducts.reduce(
          (sum, company) => sum + company.products.filter((p: any) => p.canAccommodate).length,
          0,
        ),
      },
    };
  }
}
