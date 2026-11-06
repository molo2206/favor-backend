// baggage.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Baggage } from './entities/baggage.entity';
import { ReservationVehicule } from '../reservations-vehicles/entities/reservations-vehicle.entity';
import { Trip } from '../trips/entities/trip.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { CreateBaggageDto } from './dto/create-baggage.dto';
import { UpdateBaggageDto } from './dto/update-baggage.dto';
import { VehicleBaggageRule } from '../baggage-rules/entities/baggage-rule.entity';
import { UserEntity } from 'src/users/entities/user.entity';

@Injectable()
export class BaggageService {
  constructor(
    @InjectRepository(Baggage)
    private readonly baggageRepository: Repository<Baggage>,
    @InjectRepository(VehicleBaggageRule)
    private readonly baggageRuleRepository: Repository<VehicleBaggageRule>,
    @InjectRepository(ReservationVehicule)
    private readonly reservationRepository: Repository<ReservationVehicule>,
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
  ) { }

  async create(createDto: CreateBaggageDto): Promise<Baggage> {
    const reservation = await this.reservationRepository.findOne({
      where: { id: createDto.reservationId },
      relations: ['trip', 'trip.vehicle'],
    });
    if (!reservation) {
      throw new NotFoundException(
        `Réservation avec l'ID ${createDto.reservationId} non trouvée`,
      );
    }

    const vehicleType = reservation.trip.vehicle.vehicle_type;
    const baggageRule = await this.baggageRuleRepository.findOne({
      where: { vehicle_type: vehicleType },
    });

    let extraFee = createDto.extraFee || 0;

    if (
      baggageRule &&
      createDto.weight &&
      createDto.weight > baggageRule.max_weight_kg
    ) {
      const extraWeight = createDto.weight - baggageRule.max_weight_kg;
      if (baggageRule.extra_price_per_kg) {
        extraFee += extraWeight * baggageRule.extra_price_per_kg;
      }
    }

    const baggage = this.baggageRepository.create({
      reservation_id: createDto.reservationId,
      baggage_type: createDto.baggageType,
      weight: createDto.weight,
      dimensions: createDto.dimensions,
      extra_fee: extraFee,
    });

    return this.baggageRepository.save(baggage);
  }

  async findAll(): Promise<Baggage[]> {
    return this.baggageRepository.find({
      relations: [
        'reservation',
        'reservation.trip',
        'reservation.trip.vehicle',
      ],
    });
  }

  async findAllByReservation(reservationId: string): Promise<Baggage[]> {
    return this.baggageRepository.find({
      where: { reservation_id: reservationId },
      relations: ['reservation'],
    });
  }

  async findOne(id: string): Promise<Baggage> {
    const baggage = await this.baggageRepository.findOne({
      where: { id },
      relations: [
        'reservation',
        'reservation.trip',
        'reservation.trip.vehicle',
      ],
    });
    if (!baggage) {
      throw new NotFoundException(`Bagage avec l'ID ${id} non trouvé`);
    }
    return baggage;
  }

  async update(id: string, updateDto: UpdateBaggageDto): Promise<Baggage> {
    const baggage = await this.findOne(id);

    if (updateDto.baggageType) {
      baggage.baggage_type = updateDto.baggageType;
    }
    if (updateDto.weight !== undefined) {
      baggage.weight = updateDto.weight;
    }
    if (updateDto.dimensions) {
      baggage.dimensions = updateDto.dimensions;
    }
    if (updateDto.extraFee !== undefined) {
      baggage.extra_fee = updateDto.extraFee;
    }

    if (updateDto.weight !== undefined) {
      const reservation = await this.reservationRepository.findOne({
        where: { id: baggage.reservation_id },
        relations: ['trip', 'trip.vehicle'],
      });
      if (reservation) {
        const vehicleType = reservation.trip.vehicle.vehicle_type;
        const baggageRule = await this.baggageRuleRepository.findOne({
          where: { vehicle_type: vehicleType },
        });

        if (
          baggageRule &&
          baggage.weight &&
          baggage.weight > baggageRule.max_weight_kg
        ) {
          const extraWeight = baggage.weight - baggageRule.max_weight_kg;
          if (baggageRule.extra_price_per_kg) {
            baggage.extra_fee = extraWeight * baggageRule.extra_price_per_kg;
          }
        }
      }
    }

    return this.baggageRepository.save(baggage);
  }

  async remove(id: string): Promise<void> {
    const baggage = await this.findOne(id);
    await this.baggageRepository.remove(baggage);
  }

  async calculateTotalExtraFee(reservationId: string): Promise<number> {
    const baggageList = await this.baggageRepository.find({
      where: { reservation_id: reservationId },
    });

    const total = baggageList.reduce(
      (sum, baggage) => sum + Number(baggage.extra_fee),
      0,
    );
    return total;
  }

  async getBaggageRulesByVehicleType(
    vehicleType: string,
    user: UserEntity,
  ): Promise<VehicleBaggageRule> {
    // Vérifier que l'utilisateur a une entreprise active
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        'Aucune entreprise active trouvée pour cet utilisateur.',
      );
    }

    const rule = await this.baggageRuleRepository.findOne({
      where: {
        vehicle_type: vehicleType,
        company_id: user.activeCompanyId,
      },
    });

    if (!rule) {
      throw new NotFoundException(
        `Règle de bagages pour le type ${vehicleType} non trouvée`,
      );
    }
    return rule;
  }

  async getAllBaggageRules(
    user: UserEntity,
    page: number = 1,
    limit: number = 10,
    vehicleType?: string,
  ): Promise<{
    data: VehicleBaggageRule[];
    total: number;
    page: number;
    limit: number;
  }> {
    // Vérifier que l'utilisateur a une entreprise active
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        'Aucune entreprise active trouvée pour cet utilisateur.',
      );
    }

    const skip = (page - 1) * limit;

    const queryBuilder = this.baggageRuleRepository
      .createQueryBuilder('rule')
      .leftJoinAndSelect('rule.company', 'company')
      .where('rule.company_id = :companyId', {
        companyId: user.activeCompanyId
      });

    if (vehicleType) {
      queryBuilder.andWhere('rule.vehicle_type = :vehicleType', { vehicleType });
    }

    queryBuilder.orderBy('rule.vehicle_type', 'ASC').skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async createBaggageRule(
    ruleData: Partial<VehicleBaggageRule>,
    user: UserEntity,
  ): Promise<VehicleBaggageRule> {
    // Vérifier que l'utilisateur a une entreprise active
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        'Aucune entreprise active trouvée pour cet utilisateur.',
      );
    }

    // Vérifier si une règle existe déjà pour ce type de véhicule
    const existingRule = await this.baggageRuleRepository.findOne({
      where: {
        vehicle_type: ruleData.vehicle_type,
        company_id: user.activeCompanyId,
      },
    });

    if (existingRule) {
      throw new BadRequestException(
        `Une règle pour le type ${ruleData.vehicle_type} existe déjà pour votre entreprise.`,
      );
    }

    const rule = this.baggageRuleRepository.create({
      ...ruleData,
      company_id: user.activeCompanyId,
    });

    return this.baggageRuleRepository.save(rule);
  }

  async updateBaggageRule(
    id: string,
    ruleData: Partial<VehicleBaggageRule>,
    user: UserEntity,
  ): Promise<VehicleBaggageRule> {
    // Vérifier que l'utilisateur a une entreprise active
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        'Aucune entreprise active trouvée pour cet utilisateur.',
      );
    }

    const rule = await this.baggageRuleRepository.findOne({
      where: {
        id,
        company_id: user.activeCompanyId,
      },
    });

    if (!rule) {
      throw new NotFoundException(
        `Règle de bagages avec l'ID ${id} non trouvée`,
      );
    }

    Object.assign(rule, ruleData);
    return this.baggageRuleRepository.save(rule);
  }

  async removeBaggageRule(
    id: string,
    user: UserEntity,
  ): Promise<void> {
    // Vérifier que l'utilisateur a une entreprise active
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        'Aucune entreprise active trouvée pour cet utilisateur.',
      );
    }

    const rule = await this.baggageRuleRepository.findOne({
      where: {
        id,
        company_id: user.activeCompanyId,
      },
    });

    if (!rule) {
      throw new NotFoundException(
        `Règle de bagages avec l'ID ${id} non trouvée`,
      );
    }

    await this.baggageRuleRepository.remove(rule);
  }

  async getBaggageRuleById(
    id: string,
    user: UserEntity,
  ): Promise<VehicleBaggageRule> {
    // Vérifier que l'utilisateur a une entreprise active
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        'Aucune entreprise active trouvée pour cet utilisateur.',
      );
    }

    const rule = await this.baggageRuleRepository.findOne({
      where: {
        id,
        company_id: user.activeCompanyId,
      },
      relations: ['company'],
    });

    if (!rule) {
      throw new NotFoundException(
        `Règle de bagages avec l'ID ${id} non trouvée`,
      );
    }

    return rule;
  }
}
