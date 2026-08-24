/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prefer-const */
// reservations-vehicles.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not, In, LessThanOrEqual } from 'typeorm';
import { ReservationVehicule } from './entities/reservations-vehicle.entity';
import { ReservationSeat } from './entities/reservation-seat.entity';
import { ReservationSegment } from './entities/reservation-segment.entity';
import { Trip } from '../trips/entities/trip.entity';
import { VehicleSeat } from '../seats/entities/seat.entity';
import { Baggage } from '../baggage/entities/baggage.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationStatus } from './enum/reservation-status.enum';
import { VehicleBaggageRule } from '../baggage-rules/entities/baggage-rule.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { plainToClass } from 'class-transformer';
import { NotificationType } from 'src/notification/type/notification.type';
import { OperationEntity } from 'src/operation/entity/operation.entity';
import { PushNotificationHelper } from 'src/users/utility/helpers/push-notification.helper';
import { PermissionHelper } from 'src/users/utility/helpers/permission.helper';
import { NotificationsService } from 'src/notification/notifications.service';
import { NotificationHelper } from 'src/notification/utils/notification.helper';
import { UserRole } from 'src/users/enum/user-role-enum';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { MailOrderService } from 'src/email/emailorder.service';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';
import { PawapayService } from 'src/pawapay/pawapay.service';
import { LessThan } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ReservationMeal } from '../meal/entity/reservation-meal.entity';
import { Meal } from '../meal/entity/meal.entity';
import { OperationStatus } from 'src/operation/enum/operation.status.enum';
import { PayReservationDto } from './dto/pay-reservation.dto';
import { CreateReservationAdminDto } from './dto/create-reservation-admin.dto';
import { PayReservationAdminDto } from './dto/pay-reservation-admin.dto';
import { I18nService } from 'src/libs/common/src';
import { FpayService } from 'src/fpay/fpay.service';
import { randomBytes } from 'crypto';
@Injectable()
export class ReservationsVehiclesService {
  constructor(
    @InjectRepository(ReservationVehicule)
    private readonly reservationRepository: Repository<ReservationVehicule>,
    @InjectRepository(ReservationSeat)
    private readonly reservationSeatRepository: Repository<ReservationSeat>,
    @InjectRepository(ReservationSegment)
    private readonly reservationSegmentRepository: Repository<ReservationSegment>,
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(VehicleSeat)
    private readonly seatRepository: Repository<VehicleSeat>,
    @InjectRepository(Baggage)
    private readonly baggageRepository: Repository<Baggage>,
    @InjectRepository(VehicleBaggageRule)
    private readonly baggageRuleRepository: Repository<VehicleBaggageRule>,
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
    @InjectRepository(OperationEntity)
    private readonly operationRepo: Repository<OperationEntity>,
    private readonly pawapayService: PawapayService,
    @InjectRepository(Meal)
    private mealRepository: Repository<Meal>,
    @InjectRepository(ReservationMeal)
    private reservationMealRepository: Repository<ReservationMeal>,
    private readonly i18n: I18nService,
    private readonly fpayService: FpayService,
  ) { }

  @Cron('0 */5 * * * *')
  async cancelExpiredPendingReservations() {
    const now = new Date();
    const expiredReservations = await this.reservationRepository.find({
      where: {
        status: ReservationStatus.PENDING,
        expires_at: LessThanOrEqual(now),
      },
      relations: ['segmentReservations', 'reservationSeats', 'trip', 'user'],
    });

    for (const reservation of expiredReservations) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const locked = await queryRunner.manager.findOne(ReservationVehicule, {
          where: { id: reservation.id, status: ReservationStatus.PENDING },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) {
          await queryRunner.rollbackTransaction();
          continue;
        }

        locked.status = ReservationStatus.CANCELLED;
        await queryRunner.manager.save(locked);
        await queryRunner.commitTransaction();

        console.log(`Réservation ${locked.id} annulée (expirée)`);

        if (locked.user_id && locked.user) {
          const user = locked.user;
          const hasEmail = user.email && user.email.trim() !== '';
          const hasPhone = user.phone && user.phone.trim() !== '';
          const trip = locked.trip;
          const departureCity = trip?.segments?.[0]?.departure_city || trip?.schedule?.departure_city || 'N/A';
          const arrivalCity = trip?.segments?.[trip.segments.length - 1]?.arrival_city || trip?.schedule?.arrival_city || 'N/A';
          const reservationRef = locked.id.slice(0, 8);
          const finalTotal = locked.total_amount || 0;
          const currency = 'USD';
          const lang = user.preferredLanguage || 'fr';

          const pushTitle = await this.i18n.translate('reservation.push.expired_title', lang);
          const pushBody = await this.i18n.translate('reservation.push.expired_body', lang, {
            ref: reservationRef,
            departureCity,
            arrivalCity,
          });
          const smsBody = await this.i18n.translate('reservation.sms.expired_body', lang, {
            ref: reservationRef,
            departureCity,
            arrivalCity,
          });

          await this.pushNotificationHelper.sendAll({
            userId: user.id,
            pushTitle,
            pushBody,
            pushData: { entity: 'RESERVATION', entityId: locked.id },
            phoneNumber: hasPhone ? user.phone : undefined,
            smsBody: hasPhone ? smsBody : undefined,
            emailTo: hasEmail ? user.email : undefined,
            emailSubject: await this.i18n.translate('reservation.email.expired_subject', lang, { ref: reservationRef }),
            emailTemplate: 'trip/status.ejs',
            emailContext: {
              reservation: locked,
              user,
              oldStatus: 'PENDING',
              newStatus: 'CANCELLED',
              statusText: await this.i18n.translate('reservation.status.cancelled', lang),
              statusClass: 'cancelled',
              departureCity,
              arrivalCity,
              reservationRef,
              totalAmount: finalTotal,
              currency,
              year: new Date().getFullYear(),
            },
          });
        }
      } catch (error) {
        await queryRunner.rollbackTransaction();
        console.error(`Erreur annulation réservation ${reservation.id}:`, error);
      } finally {
        await queryRunner.release();
      }
    }
  }

  // ==================== CRÉATION D'UNE RÉSERVATION ====================
  async create(createDto: CreateReservationDto, userId?: string, lang: string = 'fr'): Promise<any> {
    const trip = await this.tripRepository.findOne({
      where: { id: createDto.tripId },
      relations: [
        'vehicle',
        'segments',
        'segments.vehicle',
        'segments.vehicle.seats',
        'company',
        'schedule',
      ],
    });
    if (!trip) throw new NotFoundException(await this.i18n.translate('reservation.error.trip_not_found', lang, { id: createDto.tripId }));
    if (trip.status !== 'SCHEDULED')
      throw new BadRequestException(await this.i18n.translate('reservation.error.trip_not_available', lang));

    const segments = trip.segments || [];
    const hasSegments = segments.length > 0;

    // Unicité des sièges
    const seatKeySet = new Set<string>();
    for (const passenger of createDto.passengers) {
      for (const seatRes of passenger.seats) {
        const key = `${seatRes.segmentId}|${seatRes.seatId}`;
        if (seatKeySet.has(key))
          throw new BadRequestException(await this.i18n.translate('reservation.error.seat_duplicate', lang, { seatId: seatRes.seatId }));
        seatKeySet.add(key);
      }
    }

    // Disponibilité des sièges
    const allSeatIds = [...new Set(createDto.passengers.flatMap(p => p.seats.map(s => s.seatId)))];
    const seatsEntities = await this.seatRepository.find({ where: { id: In(allSeatIds) } });
    const seatIdToNumber = new Map(seatsEntities.map(s => [s.id, s.seat_number]));

    const seatErrorSet = new Set<string>();
    for (const passenger of createDto.passengers) {
      for (const seatRes of passenger.seats) {
        const seatNumber = seatIdToNumber.get(seatRes.seatId);
        if (!seatNumber) {
          seatErrorSet.add(await this.i18n.translate('reservation.error.invalid_seat', lang, { seatId: seatRes.seatId }));
          continue;
        }
        if (hasSegments) {
          const targetSegments = segments.filter(s => s.id === seatRes.segmentId);
          for (const segment of targetSegments) {
            const already = await this.reservationSegmentRepository.findOne({
              where: {
                segment_id: segment.id,
                seat_id: seatRes.seatId,
                reservation: { status: ReservationStatus.CONFIRMED },
              },
            });
            if (already) {
              seatErrorSet.add(await this.i18n.translate('reservation.error.seat_taken_segment', lang, { seatNumber, order: segment.segment_order }));
            }
          }
        } else {
          const already = await this.reservationSeatRepository.findOne({
            where: {
              seat_id: seatRes.seatId,
              reservation: { trip_id: createDto.tripId, status: ReservationStatus.CONFIRMED },
            },
          });
          if (already) {
            seatErrorSet.add(await this.i18n.translate('reservation.error.seat_taken_trip', lang, { seatNumber }));
          }
        }
      }
    }
    if (seatErrorSet.size) {
      throw new BadRequestException({
        message: await this.i18n.translate('reservation.error.seats_unavailable', lang),
        errors: Array.from(seatErrorSet),
      });
    }

    // Calcul du montant réel
    let realSegmentsTotal = 0;
    if (hasSegments && createDto.passengers.length > 0) {
      for (const passenger of createDto.passengers) {
        for (const seatRes of passenger.seats) {
          const segment = segments.find(s => s.id === seatRes.segmentId);
          if (segment) realSegmentsTotal += Number(segment.segment_price || 0);
        }
      }
    } else if (trip.schedule) {
      realSegmentsTotal = Number(trip.schedule.base_price || 0);
    } else {
      throw new BadRequestException(await this.i18n.translate('reservation.error.cannot_calculate_price', lang));
    }

    // Repas
    let totalMealsFee = 0;
    const mealsData: {
      meal_id: string;
      segment_id: string | null;
      quantity: number;
      unit_price: number;
      passengerIndex: number;
    }[] = [];

    for (let idx = 0; idx < createDto.passengers.length; idx++) {
      const passenger = createDto.passengers[idx];
      if (passenger.meals?.length) {
        for (const mealDto of passenger.meals) {
          const meal = await this.mealRepository.findOne({
            where: { id: mealDto.mealId, companyId: trip.company_id },
          });
          if (!meal) throw new BadRequestException(await this.i18n.translate('reservation.error.meal_not_found', lang, { id: mealDto.mealId }));
          if (!meal.isAvailable)
            throw new BadRequestException(await this.i18n.translate('reservation.error.meal_unavailable', lang, { name: meal.name }));
          const quantity = mealDto.quantity;
          const unitPrice = meal.price;
          totalMealsFee += unitPrice * quantity;
          mealsData.push({
            meal_id: meal.id,
            segment_id: mealDto.segment_id || null,
            quantity,
            unit_price: unitPrice,
            passengerIndex: idx,
          });
        }
      }
    }

    const realTotal = realSegmentsTotal + totalMealsFee;

    if (createDto.totalPrice !== undefined && createDto.totalPrice < realTotal) {
      throw new BadRequestException(
        await this.i18n.translate('reservation.error.total_amount_lower', lang, { sent: createDto.totalPrice, real: realTotal })
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reservation = this.reservationRepository.create({
        user_id: userId,
        trip_id: createDto.tripId,
        status: ReservationStatus.PENDING,
        total_amount: realTotal,
      });
      const savedReservation = await queryRunner.manager.save(reservation);

      if (hasSegments) {
        for (let idx = 0; idx < createDto.passengers.length; idx++) {
          const passenger = createDto.passengers[idx];
          for (const seatRes of passenger.seats) {
            const segment = segments.find(s => s.id === seatRes.segmentId);
            if (!segment) continue;
            const reservationSegment = this.reservationSegmentRepository.create({
              reservation_id: savedReservation.id,
              segment_id: segment.id,
              seat_id: seatRes.seatId,
              price: segment.segment_price,
              passenger_name: passenger.lastName,
              passenger_prename: passenger.firstName,
            });
            await queryRunner.manager.save(reservationSegment);
          }
        }
      } else {
        for (let idx = 0; idx < createDto.passengers.length; idx++) {
          const passenger = createDto.passengers[idx];
          for (const seatRes of passenger.seats) {
            const reservationSeat = this.reservationSeatRepository.create({
              reservation_id: savedReservation.id,
              seat_id: seatRes.seatId,
              price: trip.schedule?.base_price || 0,
            });
            await queryRunner.manager.save(reservationSeat);
          }
        }
      }

      for (const mealData of mealsData) {
        const reservationMeal = this.reservationMealRepository.create({
          reservation_id: savedReservation.id,
          meal_id: mealData.meal_id,
          segment_id: mealData.segment_id || undefined,
          quantity: mealData.quantity,
          unit_price: mealData.unit_price,
          passenger_index: mealData.passengerIndex,
        } as any);
        await queryRunner.manager.save(reservationMeal);
      }

      let isPaid = false;
      let fpayTransactionId: string | null = null;
      let fpayReference: string | null = null;

      // ✅ AJOUT FPAY - directement avec pin et phone du body
      if (createDto.paymentMethod === PaymentMethod.FPAY) {
        // ✅ Récupérer le userId (identifiant de l'utilisateur)
        const { userId } = createDto;

        // ✅ Vérifier que userId est fourni
        if (!userId) {
          throw new BadRequestException(
            await this.i18n.translate('reservation.user_id_required', lang)
          );
        }

        // ✅ Récupérer l'utilisateur
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
          throw new BadRequestException(
            await this.i18n.translate('reservation.user_not_found', lang)
          );
        }

        // ✅ Vérifier que l'utilisateur a un compte FPay lié
        if (!user.userIdFpay) {
          // ✅ Option: Lancer OAuth automatiquement avec les données de paiement
          const { randomBytes } = require('crypto');
          const fpayUrl = process.env.FPAY_API_URL || 'https://f-pay.favorhelp.com';
          const appUrl = process.env.APP_URL || 'http://localhost:3000';
          const authCode = randomBytes(32).toString('hex');
          const clientId = 'web-client';
          const callbackUrl = `${appUrl}/oauth/callback`;

          const redirectUrl = new URL(`${fpayUrl}/oauth/login`);
          redirectUrl.searchParams.set('client_id', clientId);
          redirectUrl.searchParams.set('code', authCode);
          redirectUrl.searchParams.set('system_user_id', user.id);
          redirectUrl.searchParams.set('redirect_uri', callbackUrl);
          // ✅ AJOUTER les données de paiement dans l'URL
          redirectUrl.searchParams.set('amount', realTotal.toString());
          redirectUrl.searchParams.set('currency', 'USD');
          redirectUrl.searchParams.set('description', `Paiement de réservation #${savedReservation.id.slice(0, 8)}`);

          throw new BadRequestException({
            status: 'redirect',
            message: 'Authentification FPay requise pour la réservation.',
            redirectUrl: redirectUrl.toString(),
            openInBrowser: redirectUrl.toString(),
            system_user_id: user.id,
            reservationId: savedReservation.id,
            paymentData: {
              amount: realTotal,
              currency: 'USD',
              description: `Paiement de réservation #${savedReservation.id.slice(0, 8)}`,
            },
          });
        }

        // ✅ Vérifier que l'utilisateur est bien lié (isLink)
        if (!user.isLink) {
          throw new BadRequestException(
            'Votre compte FPay n\'est pas activé. Veuillez vous connecter via OAuth.'
          );
        }

        // ✅ Préparer les données sans phone ni pin (system_user_id est récupéré automatiquement)
        const fpayData = {
          amount: realTotal,
          currency: 'USD',
          description: `Paiement de réservation #${savedReservation.id.slice(0, 8)}`,
        };

        console.log('[Reservation] Tentative de paiement FPAY :', {
          userId: user.id,
          amount: fpayData.amount,
          currency: fpayData.currency,
          reservationId: savedReservation.id,
        });

        try {
          const fpayResponse = await this.fpayService.makePayment(fpayData, user);

          if (fpayResponse?.data?.transaction?.status === 'SUCCESS') {
            savedReservation.status = ReservationStatus.CONFIRMED;
            isPaid = true;
            fpayTransactionId = fpayResponse.data.transaction.id;
            fpayReference = fpayResponse.data.transaction.reference;
            await queryRunner.manager.save(savedReservation);

            console.log('[Reservation] ✅ Paiement FPAY réussi:', {
              transactionId: fpayTransactionId,
              reference: fpayReference,
              amount: fpayResponse.data.transaction.amount,
            });
          } else {
            throw new BadRequestException(
              await this.i18n.translate('reservation.fpay_payment_failed', lang)
            );
          }
        } catch (error: any) {
          console.error('[Reservation] ❌ Erreur paiement FPAY:', error.message);

          // ✅ Si l'utilisateur n'est pas lié, rediriger vers OAuth
          if (error.message?.includes('lié') || error.message?.includes('OAuth')) {
            const { randomBytes } = require('crypto');
            const fpayUrl = process.env.FPAY_API_URL || 'https://f-pay.favorhelp.com';
            const appUrl = process.env.APP_URL || 'http://localhost:3000';
            const authCode = randomBytes(32).toString('hex');
            const clientId = 'web-client';
            const callbackUrl = `${appUrl}/oauth/callback`;

            const redirectUrl = new URL(`${fpayUrl}/oauth/login`);
            redirectUrl.searchParams.set('client_id', clientId);
            redirectUrl.searchParams.set('code', authCode);
            redirectUrl.searchParams.set('system_user_id', user.id);
            redirectUrl.searchParams.set('redirect_uri', callbackUrl);
            redirectUrl.searchParams.set('amount', realTotal.toString());
            redirectUrl.searchParams.set('currency', 'USD');
            redirectUrl.searchParams.set('description', `Paiement de réservation #${savedReservation.id.slice(0, 8)}`);

            throw new BadRequestException({
              status: 'redirect',
              message: 'Authentification FPay requise pour la réservation.',
              redirectUrl: redirectUrl.toString(),
              openInBrowser: redirectUrl.toString(),
              system_user_id: user.id,
              reservationId: savedReservation.id,
            });
          }

          throw new BadRequestException(
            error.message || await this.i18n.translate('reservation.fpay_payment_failed', lang)
          );
        }
      }
      // ✅ FIN AJOUT FPAY

      else if (createDto.paymentMethod === PaymentMethod.MOBILE_MONEY && createDto.mobileMoneyDetails) {
        const { providerId, phone } = createDto.mobileMoneyDetails;
        const amount = realTotal.toString();
        const pawapayData = { amount, currency: 'USD', provider: providerId, phone: phone.trim() };
        try {
          const pawapayResponse = await this.pawapayService.createDepositSimple(pawapayData);
          const depositStatus = pawapayResponse.finalStatus?.data?.status;
          if (depositStatus === 'COMPLETED') {
            savedReservation.status = ReservationStatus.CONFIRMED;
            isPaid = true;
            await queryRunner.manager.save(savedReservation);
          } else {
            throw new BadRequestException(await this.i18n.translate('reservation.error.payment_failed', lang));
          }
        } catch (error) {
          throw new BadRequestException(await this.i18n.translate('reservation.error.payment_failed', lang));
        }
      } else if (createDto.paymentMethod === PaymentMethod.MANUAL) {
        savedReservation.status = ReservationStatus.PENDING;
        const expiresAfterMinutes = 5;
        savedReservation.expires_at = new Date(Date.now() + expiresAfterMinutes * 60 * 1000);
        await queryRunner.manager.save(savedReservation);
      } else {
        savedReservation.status = ReservationStatus.PENDING;
        await queryRunner.manager.save(savedReservation);
      }

      if (isPaid) {
        const operationData: any = {
          debit: 0,
          credit: realTotal,
          designation: await this.i18n.translate('reservation.operation.payment_designation', lang, { ref: savedReservation.id.slice(0, 8) }),
          status: OperationStatus.ACCEPTED,
          reservation_id: savedReservation.id,
          userId: userId ?? undefined,
          paymentMethod: createDto.paymentMethod,
          reference: savedReservation.id,
        };

        // ✅ Ajout FPAY
        if (createDto.paymentMethod === PaymentMethod.FPAY) {
          operationData.fpayTransactionId = fpayTransactionId || '';
          operationData.fpayReference = fpayReference || '';
        }

        if (createDto.paymentMethod === PaymentMethod.MOBILE_MONEY && createDto.mobileMoneyDetails?.providerId) {
          operationData.provider = createDto.mobileMoneyDetails.providerId;
        }

        const operation = this.operationRepo.create(operationData);
        await queryRunner.manager.save(operation);
      }

      await queryRunner.commitTransaction();

      const reservationWithDetails = await this.findOne(savedReservation.id, lang);

      if (userId) {
        this.processReservationNotifications(
          reservationWithDetails,
          userId,
          realTotal,
          0,
          segments,
          createDto.passengers,
          [],
          createDto.paymentMethod,
          lang,
        ).catch(err => console.error('Erreur notifications:', err));
      }

      if (reservationWithDetails.user) {
        const { password, ...rest } = reservationWithDetails.user;
        reservationWithDetails.user = rest as any;
      }

      return reservationWithDetails;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
  // ==================== NOTIFICATIONS APRÈS CRÉATION ====================
  private async processReservationNotifications(
    reservation: ReservationVehicule,
    userId: string,
    totalAmount: number,
    baggageFee: number,
    segments: any[],
    passengers: any[],
    baggageList: any[],
    paymentMethod?: string,
    lang: string = 'fr',
  ): Promise<void> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) return;

      const hasEmail = user.email && user.email.trim() !== '';
      const hasPhone = user.phone && user.phone.trim() !== '';

      const reservationSegments = await this.reservationSegmentRepository.find({
        where: { reservation_id: reservation.id },
        relations: ['segment', 'seat'],
      });

      const reservationMeals = await this.reservationMealRepository.find({
        where: { reservation_id: reservation.id },
        relations: ['meal'],
      });

      let totalMealsFee = 0;
      const mealsBySegment = new Map<string, any[]>();
      for (const rm of reservationMeals) {
        totalMealsFee += rm.quantity * rm.unit_price;
        const key = rm.segment_id || 'global';
        let list = mealsBySegment.get(key);
        if (!list) {
          list = [];
          mealsBySegment.set(key, list);
        }
        list.push({
          name: rm.meal.name,
          quantity: rm.quantity,
          unit_price: rm.unit_price,
          total_price: rm.quantity * rm.unit_price,
        });
      }

      const tickets = reservationSegments.map(rs => {
        const segmentMeals = mealsBySegment.get(rs.segment_id) || [];
        const globalMeals = mealsBySegment.get('global') || [];
        return {
          passenger_name: rs.passenger_name || '',
          passenger_prename: rs.passenger_prename || '',
          seatNumber: rs.seat?.seat_number || 'N/A',
          segment: rs.segment,
          price: rs.price,
          meals: [...segmentMeals, ...globalMeals],
        };
      });

      tickets.sort((a, b) => {
        const nameCompare = a.passenger_name.localeCompare(b.passenger_name);
        if (nameCompare !== 0) return nameCompare;
        return a.segment.segment_order - b.segment.segment_order;
      });

      const sortedSegments = [...segments].sort((a, b) => a.segment_order - b.segment_order);
      const reservedSegmentIds = new Set(reservationSegments.map(rs => rs.segment_id));
      const segmentsWithSeats = sortedSegments
        .filter(seg => reservedSegmentIds.has(seg.id))
        .map(seg => {
          const rs = reservationSegments.find(r => r.segment_id === seg.id);
          return {
            id: seg.id,
            segment_order: seg.segment_order,
            departure_city: seg.departure_city,
            arrival_city: seg.arrival_city,
            departure_datetime: seg.departure_datetime,
            estimated_arrival_datetime: seg.estimated_arrival_datetime,
            segment_price: seg.segment_price,
            vehicle: seg.vehicle,
            seat_number: rs?.seat?.seat_number || 'Non assigné',
            seat_id: rs?.seat?.id || null,
          };
        });

      let departureCity = 'N/A', arrivalCity = 'N/A';
      if (segmentsWithSeats.length > 0) {
        departureCity = segmentsWithSeats[0].departure_city;
        arrivalCity = segmentsWithSeats[segmentsWithSeats.length - 1].arrival_city;
      }

      const finalTotal = totalAmount + baggageFee + totalMealsFee;
      const reservationRef = reservation.id.slice(0, 8);
      const currency = 'USD';

      const isConfirmed = reservation.status === ReservationStatus.CONFIRMED;
      const isMobileMoney = paymentMethod === PaymentMethod.MOBILE_MONEY;
      let pushTitle = '', pushBody = '', smsBody = '';
      if (isConfirmed) {
        pushTitle = await this.i18n.translate('reservation.push.confirmed_title', lang);
        pushBody = await this.i18n.translate('reservation.push.confirmed_body', lang, { ref: reservationRef, total: finalTotal, currency });
        smsBody = await this.i18n.translate('reservation.sms.confirmed_body', lang, { ref: reservationRef, total: finalTotal, currency });
      } else {
        pushTitle = await this.i18n.translate('reservation.push.pending_title', lang);
        pushBody = await this.i18n.translate('reservation.push.pending_body', lang, { ref: reservationRef, total: finalTotal, currency });
        smsBody = await this.i18n.translate('reservation.sms.pending_body', lang, { ref: reservationRef, total: finalTotal, currency });
      }

      await this.pushNotificationHelper.sendAll({
        userId: user.id,
        pushTitle,
        pushBody,
        pushData: {
          entity: 'RESERVATION',
          entityId: reservation.id,
          totalAmount: finalTotal.toString(),
          currency,
          status: reservation.status,
        },
        phoneNumber: hasPhone ? user.phone : undefined,
        smsBody: hasPhone ? smsBody : undefined,
      });

      if (hasEmail) {
        try {
          const useTicket = (isMobileMoney && isConfirmed);
          const templateName = useTicket ? 'invoice' : 'fiche';
          let subjectTemplate = useTicket
            ? await this.i18n.translate('reservation.email.ticket_subject', lang)
            : await this.i18n.translate('reservation.email.reservation_sheet_subject', lang);

          // Remplacement manuel du placeholder {ref}
          const subject = subjectTemplate.replace(/\{ref\}/g, reservationRef);
          // ✅ Construction de l'objet de traduction pour les templates
          const translations = {
            // Ticket (billet)
            boarding: this.i18n.translate('reservation.ticket.boarding', lang),
            passenger: this.i18n.translate('reservation.ticket.passenger', lang),
            trip_number: this.i18n.translate('reservation.ticket.trip_number', lang),
            gate: this.i18n.translate('reservation.ticket.gate', lang),
            seat: this.i18n.translate('reservation.ticket.seat', lang),
            status: this.i18n.translate('reservation.ticket.status', lang),
            status_confirmed: this.i18n.translate('reservation.ticket.status_confirmed', lang),
            status_pending: this.i18n.translate('reservation.ticket.status_pending', lang),
            departure: this.i18n.translate('reservation.ticket.departure', lang),
            arrival: this.i18n.translate('reservation.ticket.arrival', lang),
            date_departure: this.i18n.translate('reservation.ticket.date_departure', lang),
            segment: this.i18n.translate('reservation.ticket.segment', lang),
            vehicle: this.i18n.translate('reservation.ticket.vehicle', lang),
            meals_title: this.i18n.translate('reservation.ticket.meals_title', lang),
            meals_total_prefix: this.i18n.translate('reservation.ticket.meals_total_prefix', lang),
            meals_total_suffix: this.i18n.translate('reservation.ticket.meals_total_suffix', lang),

            // Fiche de réservation
            title: this.i18n.translate('reservation.sheet.title', lang),
            booked_by: this.i18n.translate('reservation.sheet.booked_by', lang),
            status_pending_sheet: this.i18n.translate('reservation.sheet.status_pending', lang),
            trip_details: this.i18n.translate('reservation.sheet.trip_details', lang),
            trip_route: this.i18n.translate('reservation.sheet.trip_route', lang),
            departure_date: this.i18n.translate('reservation.sheet.departure_date', lang),
            passengers_count: this.i18n.translate('reservation.sheet.passengers_count', lang),
            seats_reserved: this.i18n.translate('reservation.sheet.seats_reserved', lang),
            status_sheet: this.i18n.translate('reservation.sheet.status', lang),
            reservation_date: this.i18n.translate('reservation.sheet.reservation_date', lang),
            validity: this.i18n.translate('reservation.sheet.validity', lang),
            valid_until: this.i18n.translate('reservation.sheet.valid_until', lang),
            table_header_no: this.i18n.translate('reservation.sheet.table_header_no', lang),
            table_header_passenger: this.i18n.translate('reservation.sheet.table_header_passenger', lang),
            table_header_segment: this.i18n.translate('reservation.sheet.table_header_segment', lang),
            table_header_seat: this.i18n.translate('reservation.sheet.table_header_seat', lang),
            table_header_price: this.i18n.translate('reservation.sheet.table_header_price', lang),
            subtotal: this.i18n.translate('reservation.sheet.subtotal', lang),
            meals: this.i18n.translate('reservation.sheet.meals', lang),
            total: this.i18n.translate('reservation.sheet.total', lang),
            payment_instructions: this.i18n.translate('reservation.sheet.payment_instructions', lang),
            mobile_money: this.i18n.translate('reservation.sheet.mobile_money', lang),
            cash_office: this.i18n.translate('reservation.sheet.cash_office', lang),
            amount_to_pay: this.i18n.translate('reservation.sheet.amount_to_pay', lang),
            summary: this.i18n.translate('reservation.sheet.summary', lang),
            trip: this.i18n.translate('reservation.sheet.trip', lang),
            total_to_pay: this.i18n.translate('reservation.sheet.total_to_pay', lang),
            thank_you: this.i18n.translate('reservation.sheet.thank_you', lang),
            payment_reminder: this.i18n.translate('reservation.sheet.payment_reminder', lang),
            contact: this.i18n.translate('reservation.sheet.contact', lang),
            legal: this.i18n.translate('reservation.sheet.legal', lang),
          };

          await this.mailOrderService.sendReservationInvoice(
            user.email,
            subject,
            {
              reservation,
              user,
              totalAmount,
              baggageFee,
              segments: segmentsWithSeats,
              baggageList,
              currency,
              tickets,
              isTicket: useTicket,
              departureCity,
              arrivalCity,
              finalTotal,
              reservationRef,
              passengers,
              totalMealsFee,
              reservationSegments,
              translations,   // ✅ Injection des traductions
              lang,           // ✅ Injection de la langue
            },
            templateName,
          );
          console.log(`Email envoyé à ${user.email} (${templateName})`);
        } catch (emailError) {
          console.error('Erreur envoi email:', emailError);
        }
      }

      try {
        await this.notificationHelper.sendReservationNotification(
          this.notificationsService,
          user.id,
          lang,
          {
            reservationId: reservation.id,
            departureCity,
            arrivalCity,
            totalAmount: finalTotal,
            currency,
            status: reservation.status,
            forCompany: false,
          },
          'RESERVATION',
          reservation.id,
        );
        console.log(`✅ Notification in-app envoyée à ${user.id}`);
      } catch (notifError) {
        console.error('❌ Erreur notification in-app:', notifError);
      }

      try {
        const superAdmins = await this.userRepository.find({
          where: { role: UserRole.SUPER_ADMIN },
        });
        for (const admin of superAdmins) {
          await this.notificationHelper.sendReservationNotification(
            this.notificationsService,
            admin.id,
            lang,
            {
              reservationId: reservation.id,
              departureCity,
              arrivalCity,
              totalAmount: finalTotal,
              currency,
              status: reservation.status,
              userFullName: user.fullName,
              forCompany: true,
            },
            'RESERVATION',
            reservation.id,
          );
        }
        console.log(`✅ Notifications envoyées à ${superAdmins.length} super admins`);
      } catch (adminError) {
        console.error('❌ Erreur notification super admins:', adminError);
      }

      if (reservation.trip?.company_id) {
        try {
          const companyAdmins = await this.userHasCompanyRepo.find({
            where: {
              company: { id: reservation.trip.company_id },
              isOwner: true,
            },
            relations: ['user'],
          });
          for (const companyAdmin of companyAdmins) {
            if (companyAdmin.user && companyAdmin.user.id !== user.id) {
              await this.notificationHelper.sendReservationNotification(
                this.notificationsService,
                companyAdmin.user.id,
                lang,
                {
                  reservationId: reservation.id,
                  departureCity,
                  arrivalCity,
                  totalAmount: finalTotal,
                  currency,
                  status: reservation.status,
                  userFullName: user.fullName,
                  forCompany: true,
                },
                'RESERVATION',
                reservation.id,
              );
            }
          }
          console.log(`✅ Notifications envoyées à ${companyAdmins.length} administrateurs d'entreprise`);
        } catch (companyError) {
          console.error('❌ Erreur notification entreprise:', companyError);
        }
      }

      console.log(`✅ Toutes les notifications envoyées pour la réservation ${reservation.id}`);
    } catch (error) {
      console.error('❌ Erreur générale dans processReservationNotifications:', error);
    }
  }
  // ==================== CRÉATION PAR ADMIN ====================
  async createByAdmin(
    createDto: CreateReservationAdminDto,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ data: ReservationVehicule }> {
    if (currentUser.role !== UserRole.ADMIN && !currentUser.activeCompanyId) {
      throw new ForbiddenException(await this.i18n.translate('reservation.error.admin_no_company', lang));
    }

    const trip = await this.tripRepository.findOne({
      where: { id: createDto.tripId },
      relations: [
        'schedule',
        'vehicle',
        'vehicle.seats',
        'company',
        'segments',
        'segments.vehicle',
        'segments.vehicle.seats',
        'reservations',
      ],
    });
    if (!trip) throw new NotFoundException(await this.i18n.translate('reservation.error.trip_not_found', lang, { id: createDto.tripId }));
    if (trip.status !== 'SCHEDULED')
      throw new BadRequestException(await this.i18n.translate('reservation.error.trip_not_available', lang));

    if (currentUser.role !== UserRole.SUPER_ADMIN) {
      if (trip.company_id !== currentUser.activeCompanyId) {
        throw new ForbiddenException(await this.i18n.translate('reservation.error.cannot_create_for_other_company', lang));
      }
    }

    const segments = trip.segments || [];
    const hasSegments = segments.length > 0;

    // Règles de bagages (simplifié)
    let vehicleForBaggageRule = trip.vehicle;
    if (!vehicleForBaggageRule && hasSegments && segments[0]?.vehicle)
      vehicleForBaggageRule = segments[0].vehicle;
    const baggageRules = await this.baggageRuleRepository.find({
      where: { vehicle_type: vehicleForBaggageRule?.vehicle_type },
    });
    const baggageRule = baggageRules[0];

    // Validations sièges (identique à create)
    const seatKeySet = new Set<string>();
    for (const passenger of createDto.passengers) {
      for (const seatRes of passenger.seats) {
        const key = `${seatRes.segmentId}|${seatRes.seatId}`;
        if (seatKeySet.has(key))
          throw new BadRequestException(await this.i18n.translate('reservation.error.seat_duplicate', lang, { seatId: seatRes.seatId }));
        seatKeySet.add(key);
      }
    }

    const allSeatIds = [...new Set(createDto.passengers.flatMap(p => p.seats.map(s => s.seatId)))];
    const seatsEntities = await this.seatRepository.find({ where: { id: In(allSeatIds) } });
    const seatIdToNumber = new Map(seatsEntities.map(s => [s.id, s.seat_number]));

    const seatErrorSet = new Set<string>();
    for (const passenger of createDto.passengers) {
      for (const seatRes of passenger.seats) {
        const seatNumber = seatIdToNumber.get(seatRes.seatId);
        if (!seatNumber) {
          seatErrorSet.add(await this.i18n.translate('reservation.error.invalid_seat', lang, { seatId: seatRes.seatId }));
          continue;
        }
        if (hasSegments) {
          const targetSegments = segments.filter(s => s.id === seatRes.segmentId);
          for (const segment of targetSegments) {
            const already = await this.reservationSegmentRepository.findOne({
              where: {
                segment_id: segment.id,
                seat_id: seatRes.seatId,
                reservation: { status: ReservationStatus.CONFIRMED },
              },
            });
            if (already) {
              seatErrorSet.add(await this.i18n.translate('reservation.error.seat_taken_segment', lang, { seatNumber, order: segment.segment_order }));
            }
          }
        } else {
          const already = await this.reservationSeatRepository.findOne({
            where: {
              seat_id: seatRes.seatId,
              reservation: { trip_id: createDto.tripId, status: ReservationStatus.CONFIRMED },
            },
          });
          if (already) {
            seatErrorSet.add(await this.i18n.translate('reservation.error.seat_taken_trip', lang, { seatNumber }));
          }
        }
      }
    }
    if (seatErrorSet.size) {
      throw new BadRequestException({
        message: await this.i18n.translate('reservation.error.seats_unavailable', lang),
        errors: Array.from(seatErrorSet),
      });
    }

    // Calcul des montants (segments, repas, bagages)
    let realSegmentsTotal = 0;
    if (hasSegments && createDto.passengers.length > 0) {
      for (const passenger of createDto.passengers) {
        for (const seatRes of passenger.seats) {
          const segment = segments.find(s => s.id === seatRes.segmentId);
          if (segment) realSegmentsTotal += Number(segment.segment_price || 0);
        }
      }
    } else if (trip.schedule) {
      realSegmentsTotal = Number(trip.schedule.base_price || 0);
    } else {
      throw new BadRequestException(await this.i18n.translate('reservation.error.cannot_calculate_price', lang));
    }

    let totalMealsFee = 0;
    const mealsData: {
      meal_id: string;
      segment_id: string | null;
      quantity: number;
      unit_price: number;
      passengerIndex: number;
    }[] = [];

    for (let idx = 0; idx < createDto.passengers.length; idx++) {
      const passenger = createDto.passengers[idx];
      if (passenger.meals?.length) {
        for (const mealDto of passenger.meals) {
          const meal = await this.mealRepository.findOne({
            where: { id: mealDto.mealId, companyId: trip.company_id },
          });
          if (!meal) throw new BadRequestException(await this.i18n.translate('reservation.error.meal_not_found', lang, { id: mealDto.mealId }));
          if (!meal.isAvailable)
            throw new BadRequestException(await this.i18n.translate('reservation.error.meal_unavailable', lang, { name: meal.name }));
          const quantity = mealDto.quantity;
          const unitPrice = meal.price;
          totalMealsFee += unitPrice * quantity;
          mealsData.push({
            meal_id: meal.id,
            segment_id: mealDto.segment_id || null,
            quantity,
            unit_price: unitPrice,
            passengerIndex: idx,
          });
        }
      }
    }

    let totalBaggageFee = 0;
    if (createDto.baggageList?.length) {
      for (const baggageItem of createDto.baggageList) {
        let extraFee = baggageItem.extraFee || 0;
        if (baggageRule && baggageItem.weight && baggageItem.weight > baggageRule.max_weight_kg) {
          const extraWeight = baggageItem.weight - baggageRule.max_weight_kg;
          if (baggageRule.extra_price_per_kg) extraFee += extraWeight * baggageRule.extra_price_per_kg;
        }
        totalBaggageFee += extraFee;
      }
    }

    const realTotal = realSegmentsTotal + totalMealsFee + totalBaggageFee;

    if (createDto.totalPrice !== undefined && createDto.totalPrice < realTotal) {
      throw new BadRequestException(
        await this.i18n.translate('reservation.error.total_amount_lower', lang, { sent: createDto.totalPrice, real: realTotal })
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reservation = this.reservationRepository.create({
        user_id: createDto.userId ?? undefined,
        trip_id: createDto.tripId,
        status: ReservationStatus.PENDING,
        total_amount: realTotal,
      });
      const savedReservation = await queryRunner.manager.save(reservation);

      if (hasSegments) {
        for (let idx = 0; idx < createDto.passengers.length; idx++) {
          const passenger = createDto.passengers[idx];
          for (const seatRes of passenger.seats) {
            const segment = segments.find(s => s.id === seatRes.segmentId);
            if (!segment) continue;
            const reservationSegment = this.reservationSegmentRepository.create({
              reservation_id: savedReservation.id,
              segment_id: segment.id,
              seat_id: seatRes.seatId,
              price: segment.segment_price,
              passenger_name: passenger.lastName,
              passenger_prename: passenger.firstName,
            });
            await queryRunner.manager.save(reservationSegment);
          }
        }
      } else {
        for (let idx = 0; idx < createDto.passengers.length; idx++) {
          const passenger = createDto.passengers[idx];
          for (const seatRes of passenger.seats) {
            const reservationSeat = this.reservationSeatRepository.create({
              reservation_id: savedReservation.id,
              seat_id: seatRes.seatId,
              price: trip.schedule?.base_price || 0,
            });
            await queryRunner.manager.save(reservationSeat);
          }
        }
      }

      if (createDto.baggageList?.length) {
        for (const baggageItem of createDto.baggageList) {
          let extraFee = baggageItem.extraFee || 0;
          if (baggageRule && baggageItem.weight && baggageItem.weight > baggageRule.max_weight_kg) {
            const extraWeight = baggageItem.weight - baggageRule.max_weight_kg;
            if (baggageRule.extra_price_per_kg) extraFee += extraWeight * baggageRule.extra_price_per_kg;
          }
          const baggage = this.baggageRepository.create({
            reservation_id: savedReservation.id,
            baggage_type: baggageItem.baggageType,
            weight: baggageItem.weight,
            dimensions: baggageItem.dimensions,
            extra_fee: extraFee,
          });
          await queryRunner.manager.save(baggage);
        }
      }

      for (const mealData of mealsData) {
        const reservationMeal = this.reservationMealRepository.create({
          reservation_id: savedReservation.id,
          meal_id: mealData.meal_id,
          segment_id: mealData.segment_id || undefined,
          quantity: mealData.quantity,
          unit_price: mealData.unit_price,
          passenger_index: mealData.passengerIndex,
        } as any);
        await queryRunner.manager.save(reservationMeal);
      }

      let isPaid = false;
      if (createDto.paymentMethod === PaymentMethod.MOBILE_MONEY) {
        if (!createDto.mobileMoneyDetails) {
          throw new BadRequestException(await this.i18n.translate('reservation.error.mobile_money_details_required', lang));
        }
        const { providerId, phone } = createDto.mobileMoneyDetails;
        const amount = realTotal.toString();
        const pawapayData = { amount, currency: 'USD', provider: providerId, phone: phone.trim() };
        try {
          const response = await this.pawapayService.createDepositSimple(pawapayData);
          if (response.finalStatus?.data?.status === 'COMPLETED') {
            savedReservation.status = ReservationStatus.CONFIRMED;
            isPaid = true;
            await queryRunner.manager.save(savedReservation);
          } else {
            const expiresAfterMinutes = 10;
            savedReservation.expires_at = new Date(Date.now() + expiresAfterMinutes * 60 * 1000);
            await queryRunner.manager.save(savedReservation);
            throw new BadRequestException(await this.i18n.translate('reservation.error.mobile_money_payment_failed_pending', lang));
          }
        } catch (err) {
          const expiresAfterMinutes = 10;
          savedReservation.expires_at = new Date(Date.now() + expiresAfterMinutes * 60 * 1000);
          await queryRunner.manager.save(savedReservation);
          throw new BadRequestException(await this.i18n.translate('reservation.error.mobile_money_error_pending', lang));
        }
      } else if (createDto.paymentMethod === PaymentMethod.CASH) {
        savedReservation.status = ReservationStatus.CONFIRMED;
        isPaid = true;
        await queryRunner.manager.save(savedReservation);
      } else {
        throw new BadRequestException(await this.i18n.translate('reservation.error.unsupported_payment_method', lang));
      }

      if (isPaid) {
        const operationData = {
          debit: 0,
          credit: realTotal,
          designation: await this.i18n.translate('reservation.operation.admin_payment_designation', lang, { ref: savedReservation.id.slice(0, 8) }),
          status: OperationStatus.ACCEPTED,
          reservation_id: savedReservation.id,
          userId: currentUser.id ?? undefined,
          paymentMethod: createDto.paymentMethod,
          reference: savedReservation.id,
          provider: createDto.mobileMoneyDetails?.providerId,
        };
        const operation = this.operationRepo.create(operationData);
        await queryRunner.manager.save(operation);
      }

      await queryRunner.commitTransaction();

      const reservationWithDetails = await this.findOne(savedReservation.id, lang);

      if (reservationWithDetails.user) {
        const { password, ...rest } = reservationWithDetails.user;
        reservationWithDetails.user = rest as any;
      }

      return { data: reservationWithDetails };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ==================== PAIEMENT PAR ADMIN ====================
  async payReservationByAdmin(
    id: string,
    paymentDto: PayReservationAdminDto,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<any> {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ['trip', 'trip.company', 'user'],
    });
    if (!reservation) {
      throw new NotFoundException(await this.i18n.translate('reservation.error.not_found', lang, { id }));
    }
    if (reservation.status !== ReservationStatus.PENDING) {
      throw new BadRequestException(await this.i18n.translate('reservation.error.only_pending_can_be_paid', lang));
    }
    if (reservation.expires_at && new Date() > reservation.expires_at) {
      throw new BadRequestException(await this.i18n.translate('reservation.error.reservation_expired', lang));
    }

    if (currentUser.role !== UserRole.SUPER_ADMIN) {
      if (!currentUser.activeCompanyId || reservation.trip.company_id !== currentUser.activeCompanyId) {
        throw new ForbiddenException(await this.i18n.translate('reservation.error.cannot_pay_other_company', lang));
      }
    }

    const totalAmount = reservation.total_amount;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let isPaid = false;

      if (paymentDto.paymentMethod === PaymentMethod.MOBILE_MONEY) {
        if (!paymentDto.mobileMoneyDetails) {
          throw new BadRequestException(await this.i18n.translate('reservation.error.mobile_money_details_required', lang));
        }
        const { providerId, phone } = paymentDto.mobileMoneyDetails;
        const amount = totalAmount.toString();
        const pawapayData = { amount, currency: 'USD', provider: providerId, phone: phone.trim() };
        try {
          const response = await this.pawapayService.createDepositSimple(pawapayData);
          if (response.finalStatus?.data?.status === 'COMPLETED') {
            isPaid = true;
          } else {
            throw new Error('Payment refused');
          }
        } catch (err) {
          throw new BadRequestException(await this.i18n.translate('reservation.error.mobile_money_payment_failed', lang));
        }
      } else if (paymentDto.paymentMethod === PaymentMethod.CASH) {
        isPaid = true;
      } else {
        throw new BadRequestException(await this.i18n.translate('reservation.error.unsupported_payment_method', lang));
      }

      if (isPaid) {
        reservation.status = ReservationStatus.CONFIRMED;
        await queryRunner.manager.save(reservation);

        const operationData = {
          debit: 0,
          credit: totalAmount,
          designation: await this.i18n.translate('reservation.operation.admin_payment_designation', lang, { ref: reservation.id.slice(0, 8) }),
          status: OperationStatus.ACCEPTED,
          reservation_id: reservation.id,
          userId: currentUser.id ?? undefined,
          paymentMethod: paymentDto.paymentMethod,
          reference: reservation.id,
          provider: paymentDto.mobileMoneyDetails?.providerId,
        };
        const operation = this.operationRepo.create(operationData);
        await queryRunner.manager.save(operation);

        await queryRunner.commitTransaction();

        if (reservation.user_id) {
          await this.sendPaymentConfirmation(reservation, paymentDto.paymentMethod, lang);
        }

        return {
          success: true,
          message: await this.i18n.translate('reservation.payment_confirmed', lang),
          reservation,
        };
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ==================== PAIEMENT PAR UTILISATEUR ====================
  async payReservation(
    id: string,
    paymentDto: PayReservationDto,
    currentUserId?: string,
    lang: string = 'fr',
  ): Promise<any> {
    const reservation = await this.findOne(id, lang);
    if (!reservation) {
      throw new NotFoundException(await this.i18n.translate('reservation.error.not_found', lang, { id }));
    }
    if (reservation.status !== ReservationStatus.PENDING) {
      throw new BadRequestException(await this.i18n.translate('reservation.error.only_pending_can_be_paid', lang));
    }
    if (reservation.expires_at && new Date() > reservation.expires_at) {
      throw new BadRequestException(await this.i18n.translate('reservation.error.reservation_expired', lang));
    }

    const totalAmount = reservation.total_amount;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let isPaid = false;

      if (paymentDto.paymentMethod === PaymentMethod.MOBILE_MONEY) {
        if (!paymentDto.mobileMoneyDetails) {
          throw new BadRequestException(await this.i18n.translate('reservation.error.mobile_money_details_required', lang));
        }
        const { providerId, phone } = paymentDto.mobileMoneyDetails;
        const amount = totalAmount.toString();
        const pawapayData = { amount, currency: 'USD', provider: providerId, phone: phone.trim() };
        try {
          const response = await this.pawapayService.createDepositSimple(pawapayData);
          if (response.finalStatus?.data?.status === 'COMPLETED') {
            isPaid = true;
          } else {
            throw new Error('Payment refused');
          }
        } catch (err) {
          throw new BadRequestException(await this.i18n.translate('reservation.error.mobile_money_payment_failed', lang));
        }
      } else if (paymentDto.paymentMethod === PaymentMethod.CASH) {
        isPaid = true;
      } else {
        throw new BadRequestException(await this.i18n.translate('reservation.error.unsupported_payment_method', lang));
      }

      if (isPaid) {
        reservation.status = ReservationStatus.CONFIRMED;
        await queryRunner.manager.save(reservation);

        const operationData = {
          debit: 0,
          credit: totalAmount,
          designation: await this.i18n.translate('reservation.operation.payment_designation', lang, { ref: reservation.id.slice(0, 8) }),
          status: OperationStatus.ACCEPTED,
          reservation_id: reservation.id,
          userId: currentUserId,
          paymentMethod: paymentDto.paymentMethod,
          reference: reservation.id,
          provider: paymentDto.mobileMoneyDetails?.providerId,
        };
        const operation = this.operationRepo.create(operationData);
        await queryRunner.manager.save(operation);

        await queryRunner.commitTransaction();

        await this.sendPaymentConfirmation(reservation, paymentDto.paymentMethod, lang);

        return {
          success: true,
          message: await this.i18n.translate('reservation.payment_confirmed', lang),
          reservation,
        };
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ==================== CONFIRMATION DE PAIEMENT (EMAIL + NOTIFICATIONS) ====================
  private async sendPaymentConfirmation(
    reservation: ReservationVehicule,
    paymentMethod: PaymentMethod,
    lang: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: reservation.user_id } });
    if (!user) return;

    const hasEmail = user.email && user.email.trim() !== '';
    const hasPhone = user.phone && user.phone.trim() !== '';

    const reservationSegments = await this.reservationSegmentRepository.find({
      where: { reservation_id: reservation.id },
      relations: ['segment', 'seat'],
    });

    const reservationMeals = await this.reservationMealRepository.find({
      where: { reservation_id: reservation.id },
      relations: ['meal'],
    });

    let totalMealsFee = 0;
    const mealsBySegment = new Map<string, any[]>();
    for (const rm of reservationMeals) {
      totalMealsFee += rm.quantity * rm.unit_price;
      const key = rm.segment_id || 'global';
      let list = mealsBySegment.get(key);
      if (!list) {
        list = [];
        mealsBySegment.set(key, list);
      }
      list.push({
        name: rm.meal.name,
        quantity: rm.quantity,
        unit_price: rm.unit_price,
        total_price: rm.quantity * rm.unit_price,
      });
    }

    const tickets = reservationSegments.map(rs => {
      const segmentMeals = mealsBySegment.get(rs.segment_id) || [];
      const globalMeals = mealsBySegment.get('global') || [];
      return {
        passenger_name: rs.passenger_name || '',
        passenger_prename: rs.passenger_prename || '',
        seatNumber: rs.seat?.seat_number || 'N/A',
        segment: rs.segment,
        price: rs.price,
        meals: [...segmentMeals, ...globalMeals],
      };
    });

    tickets.sort((a, b) => a.passenger_name.localeCompare(b.passenger_name) || a.segment.segment_order - b.segment.segment_order);

    const segments = reservation.trip?.segments || [];
    const sortedSegments = [...segments].sort((a, b) => a.segment_order - b.segment_order);
    const reservedSegmentIds = new Set(reservationSegments.map(rs => rs.segment_id));
    const segmentsWithSeats = sortedSegments
      .filter(seg => reservedSegmentIds.has(seg.id))
      .map(seg => {
        const rs = reservationSegments.find(r => r.segment_id === seg.id);
        return {
          id: seg.id,
          segment_order: seg.segment_order,
          departure_city: seg.departure_city,
          arrival_city: seg.arrival_city,
          departure_datetime: seg.departure_datetime,
          estimated_arrival_datetime: seg.estimated_arrival_datetime,
          segment_price: seg.segment_price,
          vehicle: seg.vehicle,
          seat_number: rs?.seat?.seat_number || 'Non assigné',
          seat_id: rs?.seat?.id || null,
        };
      });

    let departureCity = 'N/A', arrivalCity = 'N/A';
    if (segmentsWithSeats.length) {
      departureCity = segmentsWithSeats[0].departure_city;
      arrivalCity = segmentsWithSeats[segmentsWithSeats.length - 1].arrival_city;
    }

    const finalTotal = (reservation.total_amount || 0) + totalMealsFee;
    const reservationRef = reservation.id.slice(0, 8);
    const currency = 'USD';

    const pushTitle = await this.i18n.translate('reservation.push.confirmed_title', lang);
    const pushBody = await this.i18n.translate('reservation.push.confirmed_body', lang, { ref: reservationRef, total: finalTotal, currency });
    const smsBody = await this.i18n.translate('reservation.sms.confirmed_body', lang, { ref: reservationRef, total: finalTotal, currency });

    await this.pushNotificationHelper.sendAll({
      userId: user.id,
      pushTitle,
      pushBody,
      pushData: {
        entity: 'RESERVATION',
        entityId: reservation.id,
        totalAmount: finalTotal.toString(),
        currency,
        status: reservation.status,
      },
      phoneNumber: hasPhone ? user.phone : undefined,
      smsBody: hasPhone ? smsBody : undefined,
    });

    if (hasEmail) {
      try {
        // ✅ Construire l’objet de traduction (identique à celui de processReservationNotifications)
        const translations = {
          boarding: this.i18n.translate('reservation.ticket.boarding', lang),
          passenger: this.i18n.translate('reservation.ticket.passenger', lang),
          trip_number: this.i18n.translate('reservation.ticket.trip_number', lang),
          gate: this.i18n.translate('reservation.ticket.gate', lang),
          seat: this.i18n.translate('reservation.ticket.seat', lang),
          status: this.i18n.translate('reservation.ticket.status', lang),
          status_confirmed: this.i18n.translate('reservation.ticket.status_confirmed', lang),
          status_pending: this.i18n.translate('reservation.ticket.status_pending', lang),
          departure: this.i18n.translate('reservation.ticket.departure', lang),
          arrival: this.i18n.translate('reservation.ticket.arrival', lang),
          date_departure: this.i18n.translate('reservation.ticket.date_departure', lang),
          segment: this.i18n.translate('reservation.ticket.segment', lang),
          vehicle: this.i18n.translate('reservation.ticket.vehicle', lang),
          meals_title: this.i18n.translate('reservation.ticket.meals_title', lang),
          meals_total_prefix: this.i18n.translate('reservation.ticket.meals_total_prefix', lang),
          meals_total_suffix: this.i18n.translate('reservation.ticket.meals_total_suffix', lang),
          // Pour la fiche (pas utilisée ici, mais on peut les inclure par sécurité)
          title: this.i18n.translate('reservation.sheet.title', lang),
          booked_by: this.i18n.translate('reservation.sheet.booked_by', lang),
          status_pending_sheet: this.i18n.translate('reservation.sheet.status_pending', lang),
          trip_details: this.i18n.translate('reservation.sheet.trip_details', lang),
          trip_route: this.i18n.translate('reservation.sheet.trip_route', lang),
          departure_date: this.i18n.translate('reservation.sheet.departure_date', lang),
          passengers_count: this.i18n.translate('reservation.sheet.passengers_count', lang),
          seats_reserved: this.i18n.translate('reservation.sheet.seats_reserved', lang),
          status_sheet: this.i18n.translate('reservation.sheet.status', lang),
          reservation_date: this.i18n.translate('reservation.sheet.reservation_date', lang),
          validity: this.i18n.translate('reservation.sheet.validity', lang),
          valid_until: this.i18n.translate('reservation.sheet.valid_until', lang),
          table_header_no: this.i18n.translate('reservation.sheet.table_header_no', lang),
          table_header_passenger: this.i18n.translate('reservation.sheet.table_header_passenger', lang),
          table_header_segment: this.i18n.translate('reservation.sheet.table_header_segment', lang),
          table_header_seat: this.i18n.translate('reservation.sheet.table_header_seat', lang),
          table_header_price: this.i18n.translate('reservation.sheet.table_header_price', lang),
          subtotal: this.i18n.translate('reservation.sheet.subtotal', lang),
          meals: this.i18n.translate('reservation.sheet.meals', lang),
          total: this.i18n.translate('reservation.sheet.total', lang),
          payment_instructions: this.i18n.translate('reservation.sheet.payment_instructions', lang),
          mobile_money: this.i18n.translate('reservation.sheet.mobile_money', lang),
          cash_office: this.i18n.translate('reservation.sheet.cash_office', lang),
          amount_to_pay: this.i18n.translate('reservation.sheet.amount_to_pay', lang),
          summary: this.i18n.translate('reservation.sheet.summary', lang),
          trip: this.i18n.translate('reservation.sheet.trip', lang),
          total_to_pay: this.i18n.translate('reservation.sheet.total_to_pay', lang),
          thank_you: this.i18n.translate('reservation.sheet.thank_you', lang),
          payment_reminder: this.i18n.translate('reservation.sheet.payment_reminder', lang),
          contact: this.i18n.translate('reservation.sheet.contact', lang),
          legal: this.i18n.translate('reservation.sheet.legal', lang),
        };

        await this.mailOrderService.sendReservationInvoice(
          user.email,
          await this.i18n.translate('reservation.email.ticket_subject', lang, { ref: reservationRef }),
          {
            reservation,
            user,
            totalAmount: reservation.total_amount,
            baggageFee: 0,
            segments: segmentsWithSeats,
            baggageList: [],
            currency,
            tickets,
            isTicket: true,
            departureCity,
            arrivalCity,
            finalTotal,
            reservationRef,
            passengers: [],
            totalMealsFee,
            reservationSegments,
            translations,
            lang,
          },
          'invoice',
        );
        console.log(`Email envoyé à ${user.email}`);
      } catch (emailError) {
        console.error('Erreur envoi email:', emailError);
      }
    }

    await this.notificationHelper.sendReservationNotification(
      this.notificationsService,
      user.id,
      lang,
      {
        reservationId: reservation.id,
        departureCity,
        arrivalCity,
        totalAmount: finalTotal,
        currency,
        status: reservation.status,
        forCompany: false,
      },
      'RESERVATION',
      reservation.id,
    );
  }

  async findOne(id: string, lang: string = 'fr'): Promise<ReservationVehicule> {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: [
        'user',
        'trip',
        'trip.company',
        'trip.vehicle',
        'trip.vehicle.seats',
        'trip.schedule',
        'trip.segments',
        'trip.segments.vehicle',
        'trip.segments.vehicle.seats',
        'reservationSeats',
        'reservationSeats.seat',
        'segmentReservations',
        'segmentReservations.segment',
        'segmentReservations.seat',
        'baggageList',
        'payments',
        'meals',
        'meals.meal',
      ],
    });
    if (!reservation) {
      throw new NotFoundException(await this.i18n.translate('reservation.error.not_found', lang, { id }));
    }
    if (reservation.user) {
      reservation.user = plainToClass(UserEntity, reservation.user);
    }
    return reservation;
  }

  async findAllByUser(userId: string, lang: string = 'fr'): Promise<ReservationVehicule[]> {
    return this.reservationRepository.find({
      where: { user_id: userId },
      relations: [
        'trip',
        'trip.company',
        'trip.vehicle',
        'trip.vehicle.seats',
        'trip.segments',
        'trip.segments.vehicle',
        'trip.segments.vehicle.seats',
        'reservationSeats',
        'reservationSeats.seat',
        'segmentReservations',
        'segmentReservations.segment',
        'segmentReservations.seat',
        'baggageList',
        'payments',
        'meals',
        'meals.meal',
      ],
      order: { reservation_date: 'DESC' },
    });
  }

  async findAllByCompany(
    companyId: string,
    page: number = 1,
    limit: number = 10,
    lang: string = 'fr',
  ): Promise<{ data: ReservationVehicule[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await this.reservationRepository.findAndCount({
      where: { trip: { company_id: companyId } },
      relations: [
        'user',
        'trip',
        'trip.vehicle',
        'trip.vehicle.seats',
        'trip.segments',
        'trip.segments.vehicle',
        'trip.segments.vehicle.seats',
        'reservationSeats',
        'reservationSeats.seat',
        'segmentReservations',
        'segmentReservations.segment',
        'segmentReservations.seat',
        'baggageList',
        'payments',
        'meals',
        'meals.meal',
      ],
      order: { reservation_date: 'DESC' },
      skip,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async findAllByTrip(
    tripId: string,
    page: number = 1,
    limit: number = 10,
    lang: string = 'fr',
  ): Promise<{ data: ReservationVehicule[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await this.reservationRepository.findAndCount({
      where: { trip_id: tripId },
      relations: [
        'user',
        'trip',
        'trip.vehicle',
        'trip.vehicle.seats',
        'trip.segments',
        'trip.segments.vehicle',
        'trip.segments.vehicle.seats',
        'reservationSeats',
        'reservationSeats.seat',
        'segmentReservations',
        'segmentReservations.segment',
        'segmentReservations.seat',
        'baggageList',
        'payments',
        'meals',
        'meals.meal',
      ],
      order: { reservation_date: 'DESC' },
      skip,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async updateStatus(
    id: string,
    status: ReservationStatus,
    currentUser?: UserEntity,
    lang: string = 'fr',
  ): Promise<ReservationVehicule> {
    try {
      const reservation = await this.findOne(id, lang);
      const oldStatus = reservation.status;
      reservation.status = status;
      const updatedReservation = await this.reservationRepository.save(reservation);

      if (oldStatus !== status && reservation.user_id) {
        await this.sendStatusChangeNotifications(
          updatedReservation,
          oldStatus,
          status,
          currentUser,
          lang,
        );
      }
      return updatedReservation;
    } catch (error) {
      if (error.code === 'WARN_DATA_TRUNCATED' || error.errno === 1265) {
        throw new BadRequestException(await this.i18n.translate('reservation.error.invalid_status_value', lang, { status }));
      }
      throw new InternalServerErrorException(await this.i18n.translate('reservation.error.status_update_failed', lang));
    }
  }

  private async sendStatusChangeNotifications(
    reservation: ReservationVehicule,
    oldStatus: string,
    newStatus: string,
    currentUser?: UserEntity,
    lang: string = 'fr',
  ): Promise<void> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: reservation.user_id },
      });
      if (!user) return;

      const hasEmail = user.email && user.email.trim() !== '';
      const hasPhone = user.phone && user.phone.trim() !== '';

      const segments = reservation.trip?.segments || [];
      const sortedSegments = [...segments].sort((a, b) => a.segment_order - b.segment_order);
      const reservationSegments = await this.reservationSegmentRepository.find({
        where: { reservation_id: reservation.id },
        relations: ['segment', 'seat'],
      });

      const segmentsWithSeats = sortedSegments
        .map((segment) => {
          const reservationSegment = reservationSegments.find((rs) => rs.segment_id === segment.id);
          const seat = reservationSegment?.seat;
          return {
            ...segment,
            seat_number: seat?.seat_number || 'Non assigné',
            seat_id: seat?.id || null,
          };
        })
        .filter((segment) => segment.seat_number !== 'Non assigné');

      let departureCity = 'N/A', arrivalCity = 'N/A';
      if (segmentsWithSeats.length > 0) {
        departureCity = segmentsWithSeats[0]?.departure_city || 'N/A';
        arrivalCity = segmentsWithSeats[segmentsWithSeats.length - 1]?.arrival_city || 'N/A';
      } else if (reservation.trip?.schedule) {
        departureCity = reservation.trip.schedule.departure_city || 'N/A';
        arrivalCity = reservation.trip.schedule.arrival_city || 'N/A';
      }

      const reservationRef = reservation.id.slice(0, 8);
      const currency = 'USD';

      let statusText = '', statusTitle = '', pushTitle = '', pushBody = '', smsMessage = '', statusClass = '';
      switch (newStatus) {
        case ReservationStatus.CONFIRMED:
          statusText = await this.i18n.translate('reservation.status.confirmed', lang);
          statusTitle = await this.i18n.translate('reservation.status.confirmed_title', lang);
          statusClass = 'confirmed';
          pushTitle = await this.i18n.translate('reservation.push.confirmed_title', lang);
          pushBody = await this.i18n.translate('reservation.push.confirmed_body', lang, { ref: reservationRef, total: reservation.total_amount, currency });
          smsMessage = await this.i18n.translate('reservation.sms.confirmed_body', lang, { ref: reservationRef, total: reservation.total_amount, currency });
          break;
        case ReservationStatus.CANCELLED:
          statusText = await this.i18n.translate('reservation.status.cancelled', lang);
          statusTitle = await this.i18n.translate('reservation.status.cancelled_title', lang);
          statusClass = 'cancelled';
          pushTitle = await this.i18n.translate('reservation.push.cancelled_title', lang);
          pushBody = await this.i18n.translate('reservation.push.cancelled_body', lang, { departureCity, arrivalCity });
          smsMessage = await this.i18n.translate('reservation.sms.cancelled_body', lang, { departureCity, arrivalCity, ref: reservationRef });
          break;
        case ReservationStatus.COMPLETED:
          statusText = await this.i18n.translate('reservation.status.completed', lang);
          statusTitle = await this.i18n.translate('reservation.status.completed_title', lang);
          statusClass = 'completed';
          pushTitle = await this.i18n.translate('reservation.push.completed_title', lang);
          pushBody = await this.i18n.translate('reservation.push.completed_body', lang, { departureCity, arrivalCity });
          smsMessage = await this.i18n.translate('reservation.sms.completed_body', lang, { departureCity, arrivalCity });
          break;
        default:
          statusText = await this.i18n.translate('reservation.status.updated', lang);
          statusTitle = await this.i18n.translate('reservation.status.updated_title', lang);
          statusClass = 'pending';
          pushTitle = await this.i18n.translate('reservation.push.updated_title', lang);
          pushBody = await this.i18n.translate('reservation.push.updated_body', lang, { departureCity, arrivalCity, status: newStatus });
          smsMessage = await this.i18n.translate('reservation.sms.updated_body', lang, { departureCity, arrivalCity, status: newStatus, ref: reservationRef });
      }

      if (hasEmail) {
        try {
          if (newStatus === ReservationStatus.CONFIRMED) {
            await this.mailOrderService.sendReservationInvoice(
              user.email,
              await this.i18n.translate('reservation.email.ticket_subject', lang, { ref: reservationRef }),
              {
                reservation,
                user,
                totalAmount: reservation.total_amount,
                baggageFee: 0,
                segments: segmentsWithSeats,
                seatsList: await this.seatRepository.find({
                  where: { id: In(reservationSegments.map((rs) => rs.seat_id)) },
                }),
                baggageList: reservation.baggageList || [],
                currency,
              },
            );
          } else {
            await this.mailOrderService.sendHtmlEmail(
              user.email,
              `${statusTitle} - FavorHelp`,
              'trip/status.ejs',
              {
                reservation,
                user,
                oldStatus,
                newStatus,
                statusText,
                statusClass,
                departureCity,
                arrivalCity,
                reservationRef,
                totalAmount: reservation.total_amount,
                currency,
                year: new Date().getFullYear(),
              } as any,
            );
          }
          console.log(`✅ Email envoyé à ${user.email}`);
        } catch (emailError) {
          console.error('❌ Erreur envoi email:', emailError);
        }
      }

      if (hasPhone) {
        try {
          await this.smsHelper.sendSms(user.phone, smsMessage);
          console.log(`SMS envoyé à ${user.phone}`);
        } catch (smsError) {
          console.error('❌ Erreur envoi SMS:', smsError);
        }
      }

      try {
        await this.pushNotificationHelper.sendAll({
          userId: user.id,
          pushTitle,
          pushBody,
          pushData: {
            entity: 'RESERVATION',
            entityId: reservation.id,
            oldStatus,
            newStatus,
            departureCity,
            arrivalCity,
            totalAmount: reservation.total_amount?.toString(),
            currency,
          },
        });
        console.log(`Push notification envoyée à ${user.id}`);
      } catch (pushError) {
        console.error('Erreur envoi push:', pushError);
      }

      try {
        await this.notificationHelper.sendReservationNotification(
          this.notificationsService,
          user.id,
          lang, // ✅ ajout du paramètre lang
          {
            reservationId: reservation.id,
            departureCity,
            arrivalCity,
            totalAmount: reservation.total_amount || 0,
            currency,
            status: newStatus,
            forCompany: false,
          },
          'RESERVATION',
          reservation.id,
        );

        await this.notificationsService.sendAndSaveNotification(
          user.id,
          statusTitle,
          pushBody,
          NotificationType.RESERVATION_CREATED,
          {
            reservationId: reservation.id,
            oldStatus,
            newStatus,
            departureCity,
            arrivalCity,
            totalAmount: reservation.total_amount,
          },
        );

        console.log(`Notification in-app envoyée à ${user.id}`);
      } catch (notifError) {
        console.error('Erreur notification in-app:', notifError);
      }

      if (newStatus === ReservationStatus.CANCELLED && reservation.trip?.company_id) {
        try {
          const companyAdmins = await this.userHasCompanyRepo.find({
            where: {
              company: { id: reservation.trip.company_id },
              isOwner: true,
            },
            relations: ['user'],
          });

          for (const companyAdmin of companyAdmins) {
            if (companyAdmin.user && companyAdmin.user.id !== user.id) {
              await this.notificationHelper.sendReservationNotification(
                this.notificationsService,
                companyAdmin.user.id,
                lang, // ✅ ajout du paramètre lang
                {
                  reservationId: reservation.id,
                  departureCity,
                  arrivalCity,
                  totalAmount: reservation.total_amount || 0,
                  currency,
                  status: newStatus,
                  userFullName: user.fullName,
                  forCompany: true,
                },
                'RESERVATION',
                reservation.id,
              );

              await this.notificationsService.sendAndSaveNotification(
                companyAdmin.user.id,
                await this.i18n.translate('reservation.notification.company_cancelled_title', lang),
                await this.i18n.translate('reservation.notification.company_cancelled_body', lang, { fullName: user.fullName, departureCity, arrivalCity }),
                NotificationType.RESERVATION_CREATED,
                {
                  reservationId: reservation.id,
                  userFullName: user.fullName,
                  departureCity,
                  arrivalCity,
                  status: newStatus,
                },
              );
            }
          }
          console.log(`✅ Notification d'annulation envoyée à l'entreprise`);
        } catch (companyError) {
          console.error('❌ Erreur notification entreprise:', companyError);
        }
      }
    } catch (error) {
      console.error('❌ Erreur dans sendStatusChangeNotifications:', error);
    }
  }

  async cancelByUser(id: string, userId: string, lang: string = 'fr'): Promise<ReservationVehicule> {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ['trip'],
    });
    if (!reservation) {
      throw new NotFoundException(await this.i18n.translate('reservation.error.not_found', lang, { id }));
    }
    if (reservation.user_id !== userId) {
      throw new ForbiddenException(await this.i18n.translate('reservation.error.cancel_own_only', lang));
    }
    if (reservation.status !== ReservationStatus.PENDING && reservation.status !== ReservationStatus.CONFIRMED) {
      throw new BadRequestException(await this.i18n.translate('reservation.error.cancel_only_pending_confirmed', lang));
    }
    const trip = reservation.trip;
    if (trip && trip.departure_datetime && new Date(trip.departure_datetime) < new Date()) {
      throw new BadRequestException(await this.i18n.translate('reservation.error.cannot_cancel_departed', lang));
    }
    return this.updateStatus(id, ReservationStatus.CANCELLED, undefined, lang);
  }

  async cancelByAdmin(id: string, currentUser: UserEntity, lang: string = 'fr'): Promise<ReservationVehicule> {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ['trip', 'trip.company'],
    });
    if (!reservation) {
      throw new NotFoundException(await this.i18n.translate('reservation.error.not_found', lang, { id }));
    }
    if (reservation.status === ReservationStatus.CANCELLED) {
      throw new BadRequestException(await this.i18n.translate('reservation.error.already_cancelled', lang));
    }
    if (reservation.status === ReservationStatus.COMPLETED) {
      throw new BadRequestException(await this.i18n.translate('reservation.error.cannot_cancel_completed', lang));
    }

    if (currentUser.role !== UserRole.SUPER_ADMIN) {
      if (!currentUser.activeCompanyId || reservation.trip.company_id !== currentUser.activeCompanyId) {
        throw new ForbiddenException(await this.i18n.translate('reservation.error.cancel_own_company_only', lang));
      }
    }

    return this.updateStatus(id, ReservationStatus.CANCELLED, currentUser, lang);
  }

  async getAvailableSeats(tripId: string, lang: string = 'fr'): Promise<any> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['vehicle', 'vehicle.seats', 'segments'],
    });
    if (!trip) {
      throw new NotFoundException(await this.i18n.translate('reservation.error.trip_not_found', lang, { id: tripId }));
    }

    const hasSegments = trip.segments && trip.segments.length > 0;

    if (hasSegments) {
      const result: Array<{
        segment_id: string;
        segment_order: number;
        departure_city: string;
        arrival_city: string;
        departure_datetime: Date;
        estimated_arrival_datetime: Date;
        total_seats: number;
        reserved_seats: number;
        available_seats: number;
        available_seats_list: VehicleSeat[];
      }> = [];

      for (const segment of trip.segments) {
        const reservedSeats = await this.reservationSegmentRepository.find({
          where: {
            segment_id: segment.id,
            reservation: {
              status: Not(ReservationStatus.CANCELLED),
            },
          },
          relations: ['seat'],
        });

        const reservedSeatIds = new Set(reservedSeats.map((rs) => rs.seat_id));
        const availableSeats = trip.vehicle.seats.filter(
          (seat) => !reservedSeatIds.has(seat.id),
        );

        result.push({
          segment_id: segment.id,
          segment_order: segment.segment_order,
          departure_city: segment.departure_city,
          arrival_city: segment.arrival_city,
          departure_datetime: segment.departure_datetime,
          estimated_arrival_datetime: segment.estimated_arrival_datetime,
          total_seats: trip.vehicle.seats.length,
          reserved_seats: reservedSeats.length,
          available_seats: availableSeats.length,
          available_seats_list: availableSeats,
        });
      }
      return result;
    } else {
      const reservedSeats = await this.reservationSeatRepository.find({
        where: {
          reservation: {
            trip_id: tripId,
            status: Not(ReservationStatus.CANCELLED),
          },
        },
        relations: ['seat'],
      });

      const reservedSeatIds = new Set(reservedSeats.map((rs) => rs.seat_id));
      const availableSeats = trip.vehicle.seats.filter(
        (seat) => !reservedSeatIds.has(seat.id),
      );

      return {
        total_seats: trip.vehicle.seats.length,
        reserved_seats: reservedSeats.length,
        available_seats: availableSeats.length,
        available_seats_list: availableSeats,
      };
    }
  }

  async scanTicket(
    reservationId: string,
    segmentId: string,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<any> {
    if (!currentUser || !currentUser.id) {
      throw new UnauthorizedException({
        success: false,
        message: await this.i18n.translate('reservation.error.unauthenticated', lang),
        error: 'UNAUTHENTICATED',
      });
    }

    const reservationSegment = await this.reservationSegmentRepository.findOne({
      where: {
        reservation_id: reservationId,
        segment_id: segmentId,
      },
      relations: [
        'reservation',
        'reservation.user',
        'reservation.meals',
        'reservation.meals.meal',
        'segment',
        'seat',
        'scanner',
      ],
    });

    if (!reservationSegment) {
      throw new NotFoundException({
        success: false,
        message: await this.i18n.translate('reservation.error.ticket_not_found', lang),
        error: 'NOT_FOUND',
        data: {
          reservation_id: reservationId,
          segment_id: segmentId,
        },
      });
    }

    if (reservationSegment.isScanned) {
      throw new BadRequestException({
        success: false,
        message: await this.i18n.translate('reservation.error.ticket_already_scanned', lang, {
          from: reservationSegment.segment?.departure_city,
          to: reservationSegment.segment?.arrival_city,
        }),
        error: 'ALREADY_SCANNED',
        data: {
          scanned_at: reservationSegment.scanned_at,
          scanned_by: reservationSegment.scanner?.fullName,
        },
      });
    }

    reservationSegment.isScanned = true;
    reservationSegment.scanned_at = new Date();
    reservationSegment.scanned_by = currentUser.id;
    reservationSegment.scanner = currentUser;

    await this.reservationSegmentRepository.save(reservationSegment);

    const allSegments = await this.reservationSegmentRepository.find({
      where: { reservation_id: reservationId },
    });

    const scannedCount = allSegments.filter(s => s.isScanned).length;
    const totalCount = allSegments.length;
    const isFullyScanned = scannedCount === totalCount;

    let message = await this.i18n.translate('reservation.scan.ticket_scanned', lang, {
      from: reservationSegment.segment?.departure_city,
      to: reservationSegment.segment?.arrival_city,
    });
    if (isFullyScanned) {
      message = await this.i18n.translate('reservation.scan.all_tickets_scanned', lang, { total: totalCount });
    }

    const meals = (reservationSegment.reservation.meals || [])
      .filter(rm => rm.segment_id === segmentId || !rm.segment_id)
      .map(rm => ({
        id: rm.meal?.id,
        name: rm.meal?.name,
        description: rm.meal?.description,
        quantity: rm.quantity,
        unit_price: rm.unit_price,
        total_price: rm.quantity * rm.unit_price,
      }));

    return {
      success: true,
      message: message,
      data: {
        reservation_id: reservationId,
        scanned_segment: {
          id: reservationSegment.segment?.id,
          segment_order: reservationSegment.segment?.segment_order,
          from: reservationSegment.segment?.departure_city,
          to: reservationSegment.segment?.arrival_city,
          departure_datetime: reservationSegment.segment?.departure_datetime,
          seat: reservationSegment.seat?.seat_number,
        },
        passenger: {
          id: reservationSegment.reservation.user?.id,
          name: reservationSegment.reservation.user?.fullName,
          email: reservationSegment.reservation.user?.email,
          phone: reservationSegment.reservation.user?.phone,
        },
        scanned_by: {
          id: currentUser.id,
          name: currentUser.fullName,
          role: currentUser.role,
        },
        scanned_at: reservationSegment.scanned_at,
        progress: {
          scanned: scannedCount,
          total: totalCount,
          remaining: totalCount - scannedCount,
          percentage: (scannedCount / totalCount) * 100,
          isComplete: isFullyScanned,
        },
        meals: meals,
      },
    };
  }
}