/* eslint-disable prefer-const */
/* eslint-disable no-case-declarations */
// src/lta/lta.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateLtaDto, UpdateLtaDto } from './dto/create-lta.dto';
import {
  CompanyEntity,
  FeeBasis,
  FeeType,
} from 'src/company/entities/company.entity';
import { ShipmentStatus } from 'src/shipment/enum/shipment.dto';
import {
  LtaEntity,
  LtaType,
  PaymentMode,
  TransportMode,
} from './entity/lta.entity';
import { TrackingNumberUtilLTa } from 'src/users/utility/helpers/tracking-number.util';
import { LtaShipmentEntity } from './entity/lta-shipment.entity';
import { Shipment } from '../entity/shipment.entity';
import { ShipmentTracking } from '../entity/shipment_tracking.entity';
import {
  TrackingltaEntity,
  TrackingltaType,
} from './entity/tracking-lta.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import { OperationEntity } from 'src/operation/entity/operation.entity';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { NotificationType } from 'src/notification/type/notification.type';
import { NotificationsService } from 'src/notification/notifications.service';
import { PushNotificationHelper } from 'src/users/utility/helpers/push-notification.helper';
import { NotificationHelper } from 'src/notification/utils/notification.helper';
import {
  CompanyTransactionEntity,
  TransactionStatus,
} from 'src/Company-transaction/entity/company-transaction.entity';
import { TransactionType } from 'src/transaction/enum/transaction.enum';
import { I18nService } from 'src/libs/common/src';
import { PermissionHelper } from 'src/users/utility/helpers/permission.helper';

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  timestamp?: string;
}

@Injectable()
export class LtaService {
  constructor(
    @InjectRepository(LtaEntity)
    private readonly ltaRepository: Repository<LtaEntity>,
    @InjectRepository(CompanyEntity)
    private readonly companyRepository: Repository<CompanyEntity>,
    @InjectRepository(LtaShipmentEntity)
    private readonly ltaShipmentRepository: Repository<LtaShipmentEntity>,
    @InjectRepository(Shipment)
    private readonly shipmentRepo: Repository<Shipment>,
    @InjectRepository(ShipmentTracking)
    private readonly trackingRepo: Repository<ShipmentTracking>,
    @InjectRepository(TrackingltaEntity)
    private readonly trackingLtaRepo: Repository<TrackingltaEntity>,
    private readonly smsHelper: SmsHelper,
    @InjectRepository(OperationEntity)
    private readonly operationRepo: Repository<OperationEntity>,
    @InjectRepository(UserHasCompanyEntity)
    private readonly userHasCompanyRepository: Repository<UserHasCompanyEntity>,
    private readonly pushNotificationHelper: PushNotificationHelper,
    private readonly notificationHelper: NotificationHelper,
    private readonly notificationsService: NotificationsService,
    @InjectRepository(CompanyTransactionEntity)
    private readonly transactionRepository: Repository<CompanyTransactionEntity>,
    private readonly i18n: I18nService,
    private readonly permissionHelper: PermissionHelper,
  ) { }

  private createSuccessResponse<T>(message: string, data?: T): ApiResponse<T> {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  private createErrorResponse(message: string): ApiResponse {
    return {
      success: false,
      message,
      timestamp: new Date().toISOString(),
    };
  }

  private getBasicRelations(): string[] {
    return ['shipper', 'consignee', 'Issued_by'];
  }

  private transformLtaData(lta: LtaEntity): any {
    const { ltaShipments, ...ltaWithoutLtaShipments } = lta;
    return {
      ...ltaWithoutLtaShipments,
      shipments: ltaShipments || [],
    };
  }

  private transformLtasData(ltas: LtaEntity[]): any[] {
    return ltas.map((lta) => this.transformLtaData(lta));
  }

  private async generateUniqueLtaNumber(): Promise<string> {
    let ltaNumber: string;
    let exists: boolean;
    do {
      ltaNumber = TrackingNumberUtilLTa.generate();
      exists = await this.ltaRepository.exist({ where: { ltaNumber } });
    } while (exists);
    return ltaNumber;
  }

  async createLta(
    dto: CreateLtaDto,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<ApiResponse<any>> {
    const trackingNumber = await this.generateUniqueLtaNumber();

    try {
      const activeCompanyId = currentUser.activeCompanyId;
      if (!activeCompanyId) {
        return this.createErrorResponse(
          await this.i18n.translate('lta.no_active_company', lang),
        );
      }

      const userHasCompany = await this.userHasCompanyRepository.findOne({
        where: {
          user: { id: currentUser.id },
          company: { id: activeCompanyId },
        },
      });
      if (!userHasCompany) {
        return this.createErrorResponse(
          await this.i18n.translate('lta.unauthorized_create', lang),
        );
      }

      const shipper = await this.companyRepository.findOne({
        where: { id: activeCompanyId },
      });
      if (!shipper) {
        return this.createErrorResponse(
          await this.i18n.translate('lta.shipper_not_found', lang),
        );
      }

      const [consignee, issuedBy] = await Promise.all([
        this.companyRepository.findOne({ where: { id: dto.consigneeId } }),
        this.companyRepository.findOne({ where: { id: dto.Issued_byId } }),
      ]);
      if (!consignee || !issuedBy) {
        return this.createErrorResponse(
          await this.i18n.translate('lta.consignee_or_issuer_not_found', lang),
        );
      }

      const ltaData = {
        ltaNumber: trackingNumber,
        ltatype: dto.ltatype,
        type: dto.type || TransportMode.AIR,
        airlineOrShipName: dto.airlineOrShipName || '',
        originAirportOrPort: dto.originAirportOrPort || '',
        destinationAirportOrPort: dto.destinationAirportOrPort || '',
        transitAirportOrPort: dto.transitAirportOrPort || '',
        issueDate: dto.issueDate,
        status: ShipmentStatus.AWAITING_SHIPPING,
        weight: dto.weight || 0,
        volume: dto.volume || 0,
        value: dto.value || 0,
        currency: dto.currency || 'USD',
        paymentMode: dto.paymentMode || PaymentMode.PREPAID,
        shipper,
        consignee,
        Issued_by: issuedBy,
        origin: dto.origin || '',
        destination: dto.destination || '',
        externalLtaNumber: dto.externalLtaNumber,
        createdAt: new Date(dto.issueDate),
      };

      const lta = this.ltaRepository.create(ltaData);
      const savedLta = await this.ltaRepository.save(lta);

      const trackingEntries: TrackingltaEntity[] = [];
      if (dto.originAirportOrPort) {
        trackingEntries.push(
          this.trackingLtaRepo.create({
            name: dto.originAirportOrPort,
            type: TrackingltaType.DEPARTURE,
            ltaId: savedLta.id,
            createdById: currentUser.id,
            updatedById: currentUser.id,
          }),
        );
      }
      if (dto.transitAirportOrPort && dto.transitAirportOrPort.trim() !== '') {
        trackingEntries.push(
          this.trackingLtaRepo.create({
            name: dto.transitAirportOrPort,
            type: TrackingltaType.TRANSIT,
            ltaId: savedLta.id,
            createdById: currentUser.id,
            updatedById: currentUser.id,
          }),
        );
      }
      if (dto.destinationAirportOrPort) {
        trackingEntries.push(
          this.trackingLtaRepo.create({
            name: dto.destinationAirportOrPort,
            type: TrackingltaType.ARRIVAL,
            ltaId: savedLta.id,
            createdById: currentUser.id,
            updatedById: currentUser.id,
          }),
        );
      }
      if (dto.destination) {
        trackingEntries.push(
          this.trackingLtaRepo.create({
            name: dto.destination,
            type: TrackingltaType.ARRIVAL,
            ltaId: savedLta.id,
            createdById: currentUser.id,
            updatedById: currentUser.id,
          }),
        );
      }

      for (const trackingData of trackingEntries) {
        const exists = await this.trackingLtaRepo.findOne({
          where: {
            ltaId: trackingData.ltaId,
            name: trackingData.name,
            type: trackingData.type,
          },
        });
        if (!exists) await this.trackingLtaRepo.save(trackingData);
      }

      if (dto.shipments && dto.shipments.length > 0) {
        const ltaShipments = dto.shipments.map((shipmentId, index) =>
          this.ltaShipmentRepository.create({
            ltaId: savedLta.id,
            shipmentId,
            position: index + 1,
          }),
        );
        await this.ltaShipmentRepository.save(ltaShipments);
      }

      // Transaction creation (same as before, but with translated description)
      let transactionAmount = 0;
      let feeDescription = '';
      const feeBasis = shipper.feeB || FeeBasis.WAYBILL;
      const feeType = shipper.feeType || FeeType.FIXED;
      let feeValue = shipper.fee || 0;

      switch (feeBasis) {
        case FeeBasis.WAYBILL:
          transactionAmount =
            feeType === FeeType.FIXED
              ? feeValue
              : (feeValue / 100) * (dto.value || 0);
          feeDescription = await this.i18n.translate('lta.fee_waybill', lang, {
            ltaNumber: savedLta.ltaNumber,
          });
          break;
        case FeeBasis.MONTH:
          transactionAmount = feeValue;
          feeDescription = await this.i18n.translate('lta.fee_month', lang, {
            ltaNumber: savedLta.ltaNumber,
          });
          break;
        case FeeBasis.SHIPMENT:
        default:
          if (dto.shipments && dto.shipments.length > 0) {
            transactionAmount =
              feeType === FeeType.FIXED
                ? feeValue * dto.shipments.length
                : (feeValue / 100) * (dto.value || 0);
            feeDescription = await this.i18n.translate(
              'lta.fee_shipment_multi',
              lang,
              {
                count: dto.shipments.length,
                ltaNumber: savedLta.ltaNumber,
              },
            );
          } else {
            transactionAmount =
              feeType === FeeType.FIXED
                ? feeValue
                : (feeValue / 100) * (dto.value || 0);
            feeDescription = await this.i18n.translate('lta.fee_default', lang, {
              ltaNumber: savedLta.ltaNumber,
            });
          }
          break;
      }

      const transactionType = TransactionType.DEBIT;
      let transactionStatus = TransactionStatus.PENDING;
      let isPaid = false;
      if (dto.paymentMode === PaymentMode.PREPAID) {
        transactionStatus = TransactionStatus.COMPLETED;
        isPaid = true;
      } else if (dto.paymentMode === PaymentMode.COLLECT) {
        transactionStatus = TransactionStatus.PENDING;
        isPaid = false;
      }

      const transactionData: Partial<CompanyTransactionEntity> = {
        companyId: shipper.id,
        company: shipper,
        amount: transactionAmount,
        type: transactionType,
        status: transactionStatus,
        description: feeDescription,
        referenceId: savedLta.id,
        referenceType: 'LTA',
        ltaId: savedLta.id,
        lta: savedLta,
        feeBasis: feeBasis,
        feeType: feeType,
        metadata: {
          ltaNumber: savedLta.ltaNumber,
          weight: dto.weight,
          volume: dto.volume,
          value: dto.value,
          shipmentsCount: dto.shipments?.length || 0,
          appliedFee: feeValue,
          calculationMethod: feeType === FeeType.FIXED ? 'FIXED' : 'PERCENT',
          paymentMode: dto.paymentMode,
        },
        paid: isPaid,
      };
      const transaction = this.transactionRepository.create(transactionData);
      await this.transactionRepository.save(transaction);

      const ltaWithRelations = await this.ltaRepository
        .createQueryBuilder('lta')
        .leftJoinAndSelect('lta.shipper', 'shipper')
        .leftJoinAndSelect('lta.consignee', 'consignee')
        .leftJoinAndSelect('lta.Issued_by', 'Issued_by')
        .leftJoinAndSelect('lta.ltaShipments', 'shipments')
        .leftJoinAndSelect('shipments.shipment', 'shipment')
        .leftJoinAndSelect('shipment.package', 'package')
        .leftJoinAndSelect('shipment.user', 'user')
        .leftJoinAndSelect('lta.tracking', 'tracking')
        .where('lta.id = :id', { id: savedLta.id })
        .addOrderBy('tracking.time', 'ASC')
        .addOrderBy('shipments.position', 'ASC')
        .addOrderBy('tracking.createdAt', 'ASC')
        .getOne();

      if (!ltaWithRelations) {
        return this.createErrorResponse(
          await this.i18n.translate('lta.load_error', lang),
        );
      }

      const transformedLta = this.transformLtaData(ltaWithRelations);
      return this.createSuccessResponse(
        await this.i18n.translate('lta.create_success', lang),
        transformedLta,
      );
    } catch (error) {
      console.error('Erreur création LTA:', error);
      return this.createErrorResponse(
        await this.i18n.translate('lta.create_error', lang, {
          error: error.message,
        }),
      );
    }
  }

  async updateTrackingCompleted(
    trackingId: string,
    completed: boolean,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const tracking = await this.trackingLtaRepo.findOne({
        where: { id: trackingId },
        relations: [
          'lta',
          'lta.shipper',
          'lta.consignee',
          'lta.Issued_by',
          'lta.ltaShipments',
          'lta.ltaShipments.shipment',
          'lta.ltaShipments.shipment.user',
          'lta.ltaShipments.shipment.package',
          'lta.ltaShipments.shipment.pickupCompany',
          'lta.ltaShipments.shipment.shippingCompany',
          'lta.ltaShipments.shipment.deliveryCompany',
          'lta.ltaShipments.shipment.deliveryAddress',
        ],
      });

      if (!tracking) {
        throw new NotFoundException(
          await this.i18n.translate('lta.tracking_not_found', lang),
        );
      }

      // Vérification de permission avec try/catch pour éviter l'erreur 500
      let hasManagePermission = false;
      try {
        hasManagePermission = await this.permissionHelper.hasManageOnResource(
          currentUser,
          'WAYBILLS',
        );
      } catch (permError) {
        console.error('Erreur vérification permission:', permError);
        hasManagePermission = false;
      }

      if (!hasManagePermission) {
        throw new ForbiddenException(
          await this.i18n.translate('lta.tracking_modify_forbidden', lang),
        );
      }

      if (tracking.lta.status !== 'SHIPPING_IN_PROGRESS') {
        throw new BadRequestException(
          await this.i18n.translate('lta.tracking_invalid_status', lang),
        );
      }

      const wasCompleted = tracking.completed;
      tracking.completed = completed;
      tracking.updatedById = currentUser.id;
      if (completed && !tracking.time) {
        tracking.time = new Date();
      }

      // Envoyer les notifications même en cas d'erreur partielle
      if (completed && !wasCompleted) {
        let statusText = '';
        switch (tracking.type) {
          case TrackingltaType.DEPARTURE:
            statusText = await this.i18n.translate(
              'lta.tracking_status_departure',
              lang,
              { name: tracking.name },
            );
            break;
          case TrackingltaType.TRANSIT:
            statusText = await this.i18n.translate(
              'lta.tracking_status_transit',
              lang,
              { name: tracking.name },
            );
            break;
          case TrackingltaType.ARRIVAL:
            const isFinalDestination =
              tracking.name === tracking.lta.destination ||
              tracking.name === tracking.lta.destinationAirportOrPort;
            statusText = isFinalDestination
              ? await this.i18n.translate('lta.tracking_status_arrival_final', lang, {
                name: tracking.name,
              })
              : await this.i18n.translate('lta.tracking_status_arrival', lang, {
                name: tracking.name,
              });
            break;
        }

        if (statusText) {
          const phonesAlreadySent = new Set<string>();
          const userIdsAlreadyNotified = new Set<string>();

          for (const ltaShipment of tracking.lta.ltaShipments) {
            const shipment = ltaShipment.shipment;
            if (!shipment) continue;

            const targetUser = shipment.user;
            const phone =
              shipment.user?.phone ||
              shipment.clientPhone ||
              shipment.whatsapp_number;

            if (targetUser?.id && userIdsAlreadyNotified.has(targetUser.id))
              continue;
            if (targetUser?.id) userIdsAlreadyNotified.add(targetUser.id);
            if (phone && phonesAlreadySent.has(phone)) continue;
            if (phone) phonesAlreadySent.add(phone);

            if (targetUser) {
              // Ne pas attendre la notification pour ne pas bloquer
              this.processShipmentTrackingNotification(
                shipment,
                {
                  type: tracking.type,
                  name: tracking.name,
                  time: tracking.time || new Date(),
                },
                statusText,
                targetUser,
                lang,
              ).catch((err) => console.error('Erreur notification:', err));
            } else if (phone) {
              this.sendDirectSMSNotification(phone, shipment, statusText, tracking, lang).catch((err) =>
                console.error('Erreur SMS:', err)
              );
            }
          }
        }
      }

      const updatedTracking = await this.trackingLtaRepo.save(tracking);
      return {
        success: true,
        message: completed
          ? await this.i18n.translate('lta.tracking_completed', lang)
          : await this.i18n.translate('lta.tracking_updated', lang),
        data: updatedTracking,
      };
    } catch (error) {
      console.error('Erreur updateTrackingCompleted:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : await this.i18n.translate('lta.tracking_update_error', lang),
      };
    }
  }

  private async processShipmentTrackingNotification(
    shipment: Shipment,
    tracking: { type: string; name: string; time?: Date },
    statusText: string,
    targetUser: UserEntity,
    lang: string,
  ): Promise<void> {
    try {
      if (!targetUser) {
        console.warn('Aucun utilisateur cible pour la notification');
        return;
      }

      const hasEmail = targetUser.email && targetUser.email.trim() !== '';
      const hasPhone = targetUser.phone && targetUser.phone.trim() !== '';

      const notificationOptions: any = {
        userId: targetUser.id,
        pushTitle: await this.i18n.translate('lta.push_shipment_title', lang, {
          trackingNumber: shipment.trackingNumber,
        }),
        pushBody: await this.i18n.translate('lta.push_shipment_body', lang, {
          trackingNumber: shipment.trackingNumber,
          status: statusText,
        }),
        pushData: {
          entity: 'SHIPMENT',
          entityId: shipment.id,
          trackingType: tracking.type,
          trackingName: tracking.name,
          status: statusText,
        },
      };

      // Gérer les erreurs email sans bloquer
      if (hasEmail) {
        try {
          notificationOptions.emailTo = targetUser.email;
          notificationOptions.emailSubject = await this.i18n.translate(
            'lta.email_shipment_subject',
            lang,
            { trackingNumber: shipment.trackingNumber },
          );
          notificationOptions.emailTemplate = 'shipment.ejs';
          notificationOptions.emailContext = {
            user: {
              id: targetUser.id,
              fullName: targetUser.fullName,
              email: targetUser.email,
              phone: targetUser.phone,
              city: targetUser.city,
              country: targetUser.country,
            },
            shipment: {
              id: shipment.id,
              trackingNumber: shipment.trackingNumber,
              status: statusText,
              pickupEnabled: shipment.pickupEnabled,
              shippingEnabled: shipment.shippingEnabled,
              deliveryEnabled: shipment.deliveryEnabled,
              pickupFrom: shipment.pickupFrom,
              pickupTo: shipment.pickupTo,
              shippingFrom: shipment.shippingFrom,
              shippingTo: shipment.shippingTo,
              deliveryFrom: shipment.deliveryAddress?.address ?? '',
              deliveryTo: shipment.deliveryAddress?.address ?? '',
              deliveryContactName: shipment.deliveryAddress
                ? `${shipment.deliveryAddress.firstName} ${shipment.deliveryAddress.lastName}`
                : '',
              deliveryContactPhone: shipment.deliveryAddress?.phone ?? '',
              pickupContactName: shipment.pickupContactName,
              pickupContactPhone: shipment.pickupContactPhone,
              whatsapp_number: shipment.whatsapp_number,
              paymentMethod: shipment.paymentMethod,
              createdAt: shipment.createdAt,
              trackingType: tracking.type,
              trackingName: tracking.name,
              trackingTime: tracking.time || new Date(),
              pickupCompany: shipment.pickupCompany
                ? {
                  id: shipment.pickupCompany.id,
                  companyName: shipment.pickupCompany.companyName,
                  phone: shipment.pickupCompany.phone,
                  email: shipment.pickupCompany.email,
                  address: shipment.pickupCompany.address,
                }
                : null,
              shippingCompany: shipment.shippingCompany
                ? {
                  id: shipment.shippingCompany.id,
                  companyName: shipment.shippingCompany.companyName,
                  phone: shipment.shippingCompany.phone,
                  email: shipment.shippingCompany.email,
                  address: shipment.shippingCompany.address,
                }
                : null,
              deliveryCompany: shipment.deliveryCompany
                ? {
                  id: shipment.deliveryCompany.id,
                  companyName: shipment.deliveryCompany.companyName,
                  phone: shipment.deliveryCompany.phone,
                  email: shipment.deliveryCompany.email,
                  address: shipment.deliveryCompany.address,
                }
                : null,
              package: shipment.package
                ? {
                  description: shipment.package.description,
                  external_quantity: shipment.package.external_quantity,
                  weight: shipment.package.weight,
                  dimensions: shipment.package.dimensions,
                  value: shipment.package.value,
                  fragile: shipment.package.fragile,
                }
                : null,
            },
          };
          notificationOptions.sendShipmentPdf = false;
        } catch (emailError) {
          console.error('Erreur préparation email:', emailError);
        }
      }

      if (hasPhone) {
        notificationOptions.phoneNumber = targetUser.phone;
        notificationOptions.smsBody = await this.i18n.translate(
          'lta.sms_shipment_body',
          lang,
          {
            trackingNumber: shipment.trackingNumber,
            status: statusText,
          },
        );
      }

      // Envoyer la notification sans attendre la réponse
      await this.pushNotificationHelper.sendAll(notificationOptions).catch(err =>
        console.error('Erreur envoi push notification:', err)
      );

      // Notification in-app (ne pas bloquer si erreur)
      await this.notificationHelper.sendNotification(
        this.notificationsService,
        targetUser.id,
        NotificationType.LOGISTIC,
        lang,
        {
          trackingNumber: shipment.trackingNumber,
          status: statusText,
          trackingType: tracking.type,
          trackingName: tracking.name,
          shipmentId: shipment.id,
          pickupCompanyName: shipment.pickupCompany?.companyName,
          shippingCompanyName: shipment.shippingCompany?.companyName,
          deliveryCompanyName: shipment.deliveryCompany?.companyName,
        },
        'SHIPMENT',
        shipment.id,
      ).catch(err => console.error('Erreur notification in-app:', err));

      console.log(`Notifications envoyées au client pour le colis ${shipment.trackingNumber}`);
    } catch (error) {
      console.error('Erreur processShipmentTrackingNotification:', error);
      // Ne pas relancer l'erreur pour éviter le 500
    }
  }

  private async sendDirectSMSNotification(
    phone: string,
    shipment: Shipment,
    statusText: string,
    tracking: any,
    lang: string,
  ): Promise<void> {
    try {
      if (!phone || phone.trim() === '') return;
      const message = await this.i18n.translate('lta.sms_shipment_direct', lang, {
        trackingNumber: shipment.trackingNumber,
        status: statusText,
        time: new Date(tracking.time || Date.now()).toLocaleString(),
      });
      await this.pushNotificationHelper.sendAll({
        phoneNumber: phone,
        smsBody: message,
      });
      console.log(`SMS envoyé à ${phone} pour colis ${shipment.trackingNumber}`);
    } catch (error) {
      console.error(`Erreur envoi SMS à ${phone}:`, error);
    }
  }

  async getLtaById(
    id: string,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<ApiResponse<any>> {
    try {
      const lta = await this.ltaRepository
        .createQueryBuilder('lta')
        .leftJoinAndSelect('lta.shipper', 'shipper')
        .leftJoinAndSelect('lta.consignee', 'consignee')
        .leftJoinAndSelect('lta.Issued_by', 'Issued_by')
        .leftJoinAndSelect('lta.ltaShipments', 'shipments')
        .leftJoinAndSelect('shipments.shipment', 'shipment')
        .leftJoinAndSelect('shipment.package', 'package')
        .leftJoinAndSelect('shipment.user', 'user')
        .leftJoinAndSelect('lta.tracking', 'tracking')
        .where('lta.id = :id', { id })
        .addOrderBy('shipments.position', 'ASC')
        .addOrderBy('tracking.createdAt', 'ASC')
        .getOne();

      if (!lta) {
        return this.createErrorResponse(
          await this.i18n.translate('lta.not_found_id', lang, { id }),
        );
      }

      const activeCompanyId = currentUser.activeCompanyId;
      if (
        lta.shipperId !== activeCompanyId &&
        lta.consigneeId !== activeCompanyId &&
        lta.Issued_byId !== activeCompanyId
      ) {
        return this.createErrorResponse(
          await this.i18n.translate('lta.access_denied', lang),
        );
      }

      const transformedLta = this.transformLtaData(lta);
      return this.createSuccessResponse(
        await this.i18n.translate('lta.retrieve_success', lang),
        transformedLta,
      );
    } catch (error) {
      console.error('Erreur getLtaById:', error);
      return this.createErrorResponse(
        await this.i18n.translate('lta.retrieve_error', lang, {
          error: error.message,
        }),
      );
    }
  }

  async getLtaByNumber(trackingNumber: string, lang: string = 'fr'): Promise<ApiResponse<any>> {
    try {
      const shipment = await this.shipmentRepo
        .createQueryBuilder('shipment')
        .leftJoinAndSelect('shipment.package', 'package')
        .leftJoinAndSelect('shipment.user', 'user')
        .leftJoinAndSelect('shipment.deliveryAddress', 'deliveryAddress')
        .where('shipment.trackingNumber = :trackingNumber', { trackingNumber })
        .getOne();

      if (!shipment) {
        throw new NotFoundException(
          await this.i18n.translate('lta.shipment_not_found', lang, { trackingNumber }),
        );
      }

      const lta = await this.ltaRepository
        .createQueryBuilder('lta')
        .leftJoinAndSelect('lta.shipper', 'shipper')
        .leftJoinAndSelect('lta.consignee', 'consignee')
        .leftJoinAndSelect('lta.Issued_by', 'Issued_by')
        .leftJoinAndSelect('lta.ltaShipments', 'ltaShipments')
        .leftJoinAndSelect('ltaShipments.shipment', 'shipmentItem')
        .leftJoinAndSelect('shipmentItem.package', 'package')
        .leftJoinAndSelect('shipmentItem.user', 'user')
        .leftJoinAndSelect('shipmentItem.deliveryAddress', 'deliveryAddress')
        .leftJoinAndSelect('lta.tracking', 'tracking')
        .where('shipmentItem.id = :shipmentId', { shipmentId: shipment.id })
        .orderBy('lta.sub_lta', 'DESC')
        .getOne();

      if (!lta) {
        return {
          success: true,
          message: await this.i18n.translate('lta.shipment_found_no_lta', lang),
          data: {
            id: null,
            ltaNumber: null,
            externalLtaNumber: null,
            originAirportOrPort: null,
            destinationAirportOrPort: null,
            origin: shipment.shippingFrom || null,
            destination: shipment.shippingTo || null,
            tracking: [],
            shipment,
            isInLta: false,
            isTrackedShipment: true,
            trackingSource: {
              shipmentTrackingNumber: trackingNumber,
              found: true,
              inLta: false,
              message: await this.i18n.translate('lta.shipment_found_no_lta', lang),
            },
          },
        };
      }

      const trackingGroupOrder: Record<string, number> = {
        departure: 1,
        transit: 2,
        arrival: 3,
      };
      if (lta.tracking?.length) {
        lta.tracking.sort((a, b) => {
          const groupDiff =
            (trackingGroupOrder[a.type] ?? 99) - (trackingGroupOrder[b.type] ?? 99);
          if (groupDiff !== 0) return groupDiff;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });
      }

      const responseData: any = {
        ...lta,
        shipment: lta.ltaShipments?.[0]?.shipment,
        isInLta: true,
        isTrackedShipment: true,
        trackingSource: {
          shipmentTrackingNumber: trackingNumber,
          found: true,
          inLta: true,
        },
      };
      delete responseData.ltaShipments;

      return {
        success: true,
        message: await this.i18n.translate('lta.shipment_found_in_lta', lang),
        data: responseData,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      console.error('Erreur getLtaByNumber:', error);
      throw new NotFoundException(
        await this.i18n.translate('lta.shipment_search_error', lang, { trackingNumber }),
      );
    }
  }

  async getAllLtas(
    currentUser: UserEntity,
    page: number = 1,
    limit: number = 10,
    search?: string,
    type?: string,
    status?: string,
    lang: string = 'fr',
  ): Promise<any> {
    try {
      const skip = (page - 1) * limit;
      const activeCompanyId = currentUser.activeCompanyId;

      if (!activeCompanyId) {
        throw new BadRequestException(
          await this.i18n.translate('lta.no_active_company', lang),
        );
      }

      const companyFilter =
        '(lta.shipperId = :companyId OR lta.consigneeId = :companyId OR lta.Issued_byId = :companyId)';

      const baseQuery = this.ltaRepository
        .createQueryBuilder('lta')
        .where(companyFilter, {
          companyId: activeCompanyId,
        });

      const countQueryBuilder = baseQuery
        .clone()
        .leftJoin('lta.ltaShipments', 'ltaShipments')
        .leftJoin('ltaShipments.shipment', 'shipment');

      if (type && type.trim() !== '') {
        if (type.toUpperCase() === 'LTA') {
          countQueryBuilder.andWhere('lta.sub_lta = :subLta', {
            subLta: false,
          });
        } else if (type.toUpperCase() === 'SUB_LTA') {
          countQueryBuilder.andWhere('lta.sub_lta = :subLta', {
            subLta: true,
          });
        }
      }

      if (status && status.trim() !== '') {
        if (status.toUpperCase() === 'ARRIVED') {
          countQueryBuilder.andWhere('lta.status = :arrivedStatus', {
            arrivedStatus: ShipmentStatus.ARRIVED_DESTINATION,
          });
        } else if (status.toUpperCase() === 'NOT_ARRIVED') {
          countQueryBuilder.andWhere('lta.status != :arrivedStatus', {
            arrivedStatus: ShipmentStatus.ARRIVED_DESTINATION,
          });
        }
      }

      if (search && search.trim() !== '') {
        countQueryBuilder.andWhere(
          '(lta.ltaNumber LIKE :search OR ' +
          'lta.externalLtaNumber LIKE :search OR ' +
          'shipment.clientName LIKE :search OR ' +
          'shipment.clientPhone LIKE :search OR ' +
          'shipment.pin LIKE :search OR ' +
          'shipment.trackingNumber LIKE :search)',
          { search: `%${search}%` },
        );
      }

      const total = await countQueryBuilder.getCount();

      const idsQueryBuilder = baseQuery
        .clone()
        .select('lta.id', 'id')
        .addSelect('lta.createdAt', 'createdAt');

      if (type && type.trim() !== '') {
        if (type.toUpperCase() === 'LTA') {
          idsQueryBuilder.andWhere('lta.sub_lta = :subLta', {
            subLta: false,
          });
        } else if (type.toUpperCase() === 'SUB_LTA') {
          idsQueryBuilder.andWhere('lta.sub_lta = :subLta', {
            subLta: true,
          });
        }
      }

      if (status && status.trim() !== '') {
        if (status.toUpperCase() === 'ARRIVED') {
          idsQueryBuilder.andWhere('lta.status = :arrivedStatus', {
            arrivedStatus: ShipmentStatus.ARRIVED_DESTINATION,
          });
        } else if (status.toUpperCase() === 'NOT_ARRIVED') {
          idsQueryBuilder.andWhere('lta.status != :arrivedStatus', {
            arrivedStatus: ShipmentStatus.ARRIVED_DESTINATION,
          });
        }
      }

      if (search && search.trim() !== '') {
        idsQueryBuilder.andWhere(
          '(lta.ltaNumber LIKE :search OR lta.externalLtaNumber LIKE :search)',
          { search: `%${search}%` },
        );
      }

      const idsResult = await idsQueryBuilder
        .orderBy('lta.createdAt', 'DESC')
        .skip(skip)
        .take(limit)
        .getRawMany();

      const ids = idsResult.map((item) => item.id);

      if (ids.length === 0) {
        return {
          message: await this.i18n.translate('lta.no_ltas_found', lang),
          data: {
            data: [],
            total: 0,
            page,
            limit,
            totalPages: 0,
          },
        };
      }

      const ltas = await this.ltaRepository
        .createQueryBuilder('lta')
        .leftJoinAndSelect('lta.shipper', 'shipper')
        .leftJoinAndSelect('lta.consignee', 'consignee')
        .leftJoinAndSelect('lta.Issued_by', 'Issued_by')
        .leftJoinAndSelect('lta.ltaShipments', 'ltaShipments')
        .leftJoinAndSelect('ltaShipments.shipment', 'shipment')
        .leftJoinAndSelect('shipment.package', 'package')
        .leftJoinAndSelect('shipment.user', 'user')
        .leftJoinAndSelect('shipment.deliveryAddress', 'deliveryAddress')
        .leftJoinAndSelect('lta.tracking', 'tracking')
        .where('lta.id IN (:...ids)', { ids })
        .andWhere(companyFilter, {
          companyId: activeCompanyId,
        })
        .orderBy('lta.createdAt', 'DESC')
        .addOrderBy('ltaShipments.position', 'ASC')
        .addOrderBy('tracking.time', 'ASC')
        .addOrderBy('tracking.createdAt', 'DESC')
        .getMany();

      const orderedLtas = ids
        .map((id) => ltas.find((lta) => lta.id === id))
        .filter((lta): lta is LtaEntity => lta !== undefined);

      const transformedLtas = this.transformLtasData(orderedLtas);

      const message = search
        ? await this.i18n.translate('lta.search_results', lang, {
          count: orderedLtas.length,
          term: search,
        })
        : orderedLtas.length > 0
          ? await this.i18n.translate('lta.list_success', lang, {
            count: orderedLtas.length,
          })
          : await this.i18n.translate('lta.no_ltas_found', lang);

      return {
        message,
        data: {
          data: transformedLtas,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('Erreur getAllLtas:', error);

      return {
        message: await this.i18n.translate('lta.list_error', lang, {
          error: error.message,
        }),
        data: {
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
      };
    }
  }
  async getLtasByCompany(
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<ApiResponse<any[]>> {
    const activeCompanyId = currentUser.activeCompanyId;
    if (!activeCompanyId) {
      return this.createErrorResponse(
        await this.i18n.translate('lta.no_active_company', lang),
      );
    }

    try {
      const ltas = await this.ltaRepository
        .createQueryBuilder('lta')
        .leftJoinAndSelect('lta.shipper', 'shipper')
        .leftJoinAndSelect('lta.consignee', 'consignee')
        .leftJoinAndSelect('lta.Issued_by', 'Issued_by')
        .leftJoinAndSelect('lta.ltaShipments', 'shipments')
        .leftJoinAndSelect('shipments.shipment', 'shipment')
        .leftJoinAndSelect('shipment.package', 'package')
        .leftJoinAndSelect('shipment.user', 'user')
        .leftJoinAndSelect('lta.tracking', 'tracking')
        .where(
          'lta.shipperId = :companyId OR lta.consigneeId = :companyId OR lta.Issued_byId = :companyId',
          { companyId: activeCompanyId },
        )
        .orderBy('lta.createdAt', 'DESC')
        .addOrderBy('shipments.position', 'ASC')
        .addOrderBy('tracking.time', 'ASC')
        .addOrderBy('tracking.createdAt', 'ASC')
        .getMany();

      const message =
        ltas.length > 0
          ? await this.i18n.translate('lta.company_list_success', lang, {
            count: ltas.length,
          })
          : await this.i18n.translate('lta.no_ltas_for_company', lang);

      const transformedLtas = this.transformLtasData(ltas);
      return this.createSuccessResponse(message, transformedLtas);
    } catch (error) {
      console.error('Erreur getLtasByCompany:', error);
      return this.createErrorResponse(
        await this.i18n.translate('lta.company_list_error', lang, {
          error: error.message,
        }),
      );
    }
  }

  async updateLta(
    id: string,
    dto: Partial<UpdateLtaDto>,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<ApiResponse<any>> {
    try {
      const existingLta = await this.ltaRepository.findOne({
        where: { id },
        relations: ['shipper', 'consignee', 'Issued_by', 'tracking'],
      });
      if (!existingLta) {
        return this.createErrorResponse(
          await this.i18n.translate('lta.not_found_id', lang, { id }),
        );
      }
      if (existingLta.status === ShipmentStatus.ARRIVED_DESTINATION) {
        return this.createErrorResponse(
          await this.i18n.translate('lta.cannot_update_arrived', lang),
        );
      }

      if (dto.externalLtaNumber !== undefined)
        existingLta.externalLtaNumber = dto.externalLtaNumber;
      if (dto.ltatype !== undefined) existingLta.ltatype = dto.ltatype;
      if (dto.type !== undefined) existingLta.type = dto.type;
      if (dto.originAirportOrPort !== undefined)
        existingLta.originAirportOrPort = dto.originAirportOrPort;
      if (dto.transitAirportOrPort !== undefined)
        existingLta.transitAirportOrPort = dto.transitAirportOrPort;
      if (dto.destinationAirportOrPort !== undefined)
        existingLta.destinationAirportOrPort = dto.destinationAirportOrPort;
      if (dto.origin !== undefined) existingLta.origin = dto.origin;
      if (dto.destination !== undefined) existingLta.destination = dto.destination;
      if (dto.issueDate !== undefined)
        existingLta.issueDate = new Date(dto.issueDate);
      if (dto.status !== undefined) existingLta.status = dto.status;
      if (dto.weight !== undefined) existingLta.weight = dto.weight;
      if (dto.volume !== undefined) existingLta.volume = dto.volume;
      if (dto.value !== undefined) existingLta.value = dto.value;
      if (dto.currency !== undefined) existingLta.currency = dto.currency;
      if (dto.paymentMode !== undefined) existingLta.paymentMode = dto.paymentMode;

      if (dto.shipperId !== undefined) {
        const shipper = await this.companyRepository.findOne({
          where: { id: dto.shipperId },
        });
        if (!shipper)
          return this.createErrorResponse(
            await this.i18n.translate('lta.shipper_not_found', lang),
          );
        existingLta.shipper = shipper;
        existingLta.shipperId = shipper.id;
      }
      if (dto.consigneeId !== undefined) {
        const consignee = await this.companyRepository.findOne({
          where: { id: dto.consigneeId },
        });
        if (!consignee)
          return this.createErrorResponse(
            await this.i18n.translate('lta.consignee_not_found', lang),
          );
        existingLta.consignee = consignee;
        existingLta.consigneeId = consignee.id;
      }
      if (dto.Issued_byId !== undefined) {
        const issuedBy = await this.companyRepository.findOne({
          where: { id: dto.Issued_byId },
        });
        if (!issuedBy)
          return this.createErrorResponse(
            await this.i18n.translate('lta.issuer_not_found', lang),
          );
        existingLta.Issued_by = issuedBy;
        existingLta.Issued_byId = issuedBy.id;
      }

      await this.ltaRepository.save(existingLta);

      if (dto.shipments !== undefined) {
        await this.ltaShipmentRepository.delete({ ltaId: id });
        if (dto.shipments.length > 0) {
          const ltaShipments = dto.shipments.map((shipmentId, index) =>
            this.ltaShipmentRepository.create({
              ltaId: id,
              shipmentId,
              position: index + 1,
            }),
          );
          await this.ltaShipmentRepository.save(ltaShipments);
        }
      }

      // Update tracking if location fields changed
      if (
        dto.originAirportOrPort !== undefined ||
        dto.transitAirportOrPort !== undefined ||
        dto.destinationAirportOrPort !== undefined ||
        dto.destination !== undefined ||
        dto.origin !== undefined
      ) {
        await this.trackingLtaRepo.delete({ ltaId: id });
        const trackingEntries: TrackingltaEntity[] = [];
        const departureLocation = dto.originAirportOrPort || existingLta.originAirportOrPort;
        if (departureLocation) {
          trackingEntries.push({
            name: departureLocation,
            type: TrackingltaType.DEPARTURE,
            ltaId: id,
            completed: true,
            time: new Date(),
            createdById: currentUser.id,
            updatedById: currentUser.id,
          } as TrackingltaEntity);
        }
        const transitLocation = dto.transitAirportOrPort || existingLta.transitAirportOrPort;
        if (transitLocation) {
          trackingEntries.push({
            name: transitLocation,
            type: TrackingltaType.TRANSIT,
            ltaId: id,
            completed: false,
            createdById: currentUser.id,
            updatedById: currentUser.id,
          } as TrackingltaEntity);
        }
        const destinationAirportLocation =
          dto.destinationAirportOrPort || existingLta.destinationAirportOrPort;
        if (destinationAirportLocation) {
          trackingEntries.push({
            name: destinationAirportLocation,
            type: TrackingltaType.TRANSIT,
            ltaId: id,
            completed: false,
            createdById: currentUser.id,
            updatedById: currentUser.id,
          } as TrackingltaEntity);
        }
        const finalDestination = dto.destination || existingLta.destination;
        if (finalDestination) {
          trackingEntries.push({
            name: finalDestination,
            type: TrackingltaType.ARRIVAL,
            ltaId: id,
            completed: false,
            createdById: currentUser.id,
            updatedById: currentUser.id,
          } as TrackingltaEntity);
        }
        for (const trackingData of trackingEntries) {
          await this.trackingLtaRepo.save(trackingData);
        }
      }

      const updatedLta = await this.ltaRepository
        .createQueryBuilder('lta')
        .leftJoinAndSelect('lta.shipper', 'shipper')
        .leftJoinAndSelect('lta.consignee', 'consignee')
        .leftJoinAndSelect('lta.Issued_by', 'Issued_by')
        .leftJoinAndSelect('lta.ltaShipments', 'shipments')
        .leftJoinAndSelect('shipments.shipment', 'shipment')
        .leftJoinAndSelect('shipment.package', 'package')
        .leftJoinAndSelect('shipment.user', 'user')
        .leftJoinAndSelect('shipment.deliveryAddress', 'deliveryAddress')
        .leftJoinAndSelect('lta.tracking', 'tracking')
        .where('lta.id = :id', { id })
        .orderBy('shipments.position', 'ASC')
        .addOrderBy('tracking.createdAt', 'ASC')
        .getOne();

      if (!updatedLta)
        return this.createErrorResponse(
          await this.i18n.translate('lta.load_after_update_error', lang),
        );

      const transformedLta = this.transformLtaData(updatedLta);
      return this.createSuccessResponse(
        await this.i18n.translate('lta.update_success', lang),
        transformedLta,
      );
    } catch (error) {
      console.error(error);
      return this.createErrorResponse(
        await this.i18n.translate('lta.update_error', lang, { error: error.message }),
      );
    }
  }

  async deleteLta(id: string, lang: string = 'fr'): Promise<ApiResponse<void>> {
    try {
      const exists = await this.ltaRepository.findOneBy({ id });
      if (!exists) {
        return this.createErrorResponse(
          await this.i18n.translate('lta.not_found_id', lang, { id }),
        );
      }
      await this.ltaRepository.delete(id);
      return this.createSuccessResponse(
        await this.i18n.translate('lta.delete_success', lang),
      );
    } catch (error) {
      console.error('Erreur deleteLta:', error);
      return this.createErrorResponse(
        await this.i18n.translate('lta.delete_error', lang, { error: error.message }),
      );
    }
  }

  async searchLtas(
    searchTerm: string,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<ApiResponse<any[]>> {
    if (!searchTerm || searchTerm.trim() === '') {
      return this.createErrorResponse(
        await this.i18n.translate('lta.search_empty_term', lang),
      );
    }
    const activeCompanyId = currentUser.activeCompanyId;
    if (!activeCompanyId) {
      return this.createErrorResponse(
        await this.i18n.translate('lta.no_active_company', lang),
      );
    }

    try {
      const ltas = await this.ltaRepository
        .createQueryBuilder('lta')
        .leftJoinAndSelect('lta.shipper', 'shipper')
        .leftJoinAndSelect('lta.consignee', 'consignee')
        .leftJoinAndSelect('lta.Issued_by', 'Issued_by')
        .leftJoinAndSelect('lta.ltaShipments', 'shipments')
        .leftJoinAndSelect('shipments.shipment', 'shipment')
        .leftJoinAndSelect('shipment.package', 'package')
        .leftJoinAndSelect('shipment.user', 'user')
        .where(
          '(lta.shipperId = :companyId OR lta.consigneeId = :companyId OR lta.Issued_byId = :companyId)',
          { companyId: activeCompanyId },
        )
        .andWhere(
          '(lta.ltaNumber LIKE :searchTerm OR ' +
          'lta.airlineOrShipName LIKE :searchTerm OR ' +
          'lta.originAirportOrPort LIKE :searchTerm OR ' +
          'lta.destinationAirportOrPort LIKE :searchTerm OR ' +
          'shipper.companyName LIKE :searchTerm OR ' +
          'consignee.companyName LIKE :searchTerm)',
          { searchTerm: `%${searchTerm}%` },
        )
        .orderBy('lta.createdAt', 'DESC')
        .addOrderBy('shipments.position', 'ASC')
        .getMany();

      const message =
        ltas.length > 0
          ? await this.i18n.translate('lta.search_results', lang, {
            count: ltas.length,
            term: searchTerm,
          })
          : await this.i18n.translate('lta.search_no_results', lang, {
            term: searchTerm,
          });

      const transformedLtas = this.transformLtasData(ltas);
      return this.createSuccessResponse(message, transformedLtas);
    } catch (error) {
      console.error('Erreur searchLtas:', error);
      return this.createErrorResponse(
        await this.i18n.translate('lta.search_error', lang, { error: error.message }),
      );
    }
  }

  async getLtaStats(lang: string = 'fr'): Promise<ApiResponse<any>> {
    try {
      const [totalCount, byStatus, byType, byTrackingType] = await Promise.all([
        this.ltaRepository.count(),
        this.ltaRepository
          .createQueryBuilder('lta')
          .select('lta.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .groupBy('lta.status')
          .getRawMany(),
        this.ltaRepository
          .createQueryBuilder('lta')
          .select('lta.type', 'type')
          .addSelect('COUNT(*)', 'count')
          .groupBy('lta.type')
          .getRawMany(),
        this.trackingLtaRepo
          .createQueryBuilder('tracking')
          .select('tracking.type', 'type')
          .addSelect('COUNT(*)', 'count')
          .groupBy('tracking.type')
          .getRawMany(),
      ]);
      const stats = { totalCount, byStatus, byType, byTrackingType };
      return this.createSuccessResponse(
        await this.i18n.translate('lta.stats_success', lang),
        stats,
      );
    } catch (error) {
      console.error('Erreur getLtaStats:', error);
      return this.createErrorResponse(
        await this.i18n.translate('lta.stats_error', lang, { error: error.message }),
      );
    }
  }

  async changeStatus(
    ltaId: string,
    newStatus: ShipmentStatus,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: LtaEntity }> {
    if (!ltaId) {
      throw new NotFoundException(await this.i18n.translate('lta.id_required', lang));
    }
    const lta = await this.ltaRepository.findOne({
      where: { id: ltaId },
      relations: ['ltaShipments', 'ltaShipments.shipment', 'tracking'],
    });
    if (!lta) {
      throw new NotFoundException(await this.i18n.translate('lta.not_found', lang));
    }

    const now = new Date();
    const createdSubLtas: LtaEntity[] = [];
    const motherTrackings = lta.tracking ?? [];

    try {
      if (lta.status !== newStatus) {
        await this.ltaRepository.update(
          { id: lta.id },
          { status: newStatus, updatedAt: now },
        );
      }
      for (const ltaSh of lta.ltaShipments) {
        if (!ltaSh.shipment) continue;
        await this.shipmentRepo.update(
          { id: ltaSh.shipment.id },
          { status: newStatus, updatedAt: now },
        );
      }

      if (newStatus === ShipmentStatus.ARRIVED_DESTINATION) {
        const shipmentsByCity = new Map<string, any[]>();
        for (const ltaSh of lta.ltaShipments) {
          const shipment = ltaSh.shipment;
          if (!shipment?.shippingTo) continue;
          const city = shipment.shippingTo.split(',')[0].trim();
          if (!city) continue;
          if (!shipmentsByCity.has(city)) shipmentsByCity.set(city, []);
          shipmentsByCity.get(city)!.push({ shipment, ltaShipment: ltaSh });
        }
        const normalizeCity = (value: string | null | undefined): string | null => {
          if (!value) return null;
          return value
            .split(',')[0]
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        };
        const finalCity = normalizeCity(lta.destination);
        const sortedMotherTrackings = [...motherTrackings].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );

        for (const [city, items] of shipmentsByCity.entries()) {
          const normalizedCity = normalizeCity(city);
          if (finalCity && normalizedCity === finalCity) continue;

          let subLta = await this.ltaRepository.findOne({
            where: {
              externalLtaNumber: lta.ltaNumber,
              destination: city,
              sub_lta: true,
            },
          });
          if (!subLta) {
            const insertResult = await this.ltaRepository.insert({
              ltaNumber: await this.generateUniqueLtaNumber(),
              ltatype: LtaType.HOUSE,
              type: lta.type,
              originAirportOrPort: lta.destinationAirportOrPort,
              destinationAirportOrPort: city,
              origin: lta.destination,
              destination: city,
              issueDate: now,
              status: ShipmentStatus.SHIPPING_IN_PROGRESS,
              currency: lta.currency,
              paymentMode: lta.paymentMode,
              shipperId: lta.consigneeId,
              Issued_byId: lta.consigneeId,
              consigneeId: lta.consigneeId,
              externalLtaNumber: lta.ltaNumber,
              sub_lta: true,
              createdAt: now,
              updatedAt: now,
            });
            const subLtaId = insertResult.identifiers[0].id;
            subLta = await this.ltaRepository.findOne({ where: { id: subLtaId } });
            createdSubLtas.push(subLta!);
            for (const t of sortedMotherTrackings) {
              const exists = await this.trackingLtaRepo.findOne({
                where: { ltaId: subLta!.id, name: t.name, type: t.type },
              });
              if (!exists) {
                await this.trackingLtaRepo.insert({
                  name: t.name,
                  type: t.type,
                  ltaId: subLta!.id,
                  createdById: t.createdById,
                  updatedById: t.updatedById,
                  completed: t.completed,
                  time: t.time,
                  createdAt: t.createdAt,
                  updatedAt: t.updatedAt,
                });
              }
            }
            const arrivalExists = await this.trackingLtaRepo.findOne({
              where: { ltaId: subLta!.id, name: city, type: TrackingltaType.ARRIVAL },
            });
            if (!arrivalExists) {
              await this.trackingLtaRepo.insert({
                name: city,
                type: TrackingltaType.ARRIVAL,
                ltaId: subLta!.id,
                createdById: currentUser.id,
                updatedById: currentUser.id,
                completed: false,
                createdAt: now,
                updatedAt: now,
              });
            }
          }
          for (const item of items) {
            const linkExists = await this.ltaShipmentRepository.findOne({
              where: { ltaId: subLta!.id, shipmentId: item.shipment.id },
            });
            if (!linkExists) {
              await this.ltaShipmentRepository.insert({
                ltaId: subLta!.id,
                shipmentId: item.shipment.id,
                position: item.ltaShipment?.position || 0,
                isMaster: false,
                notes: await this.i18n.translate('lta.transfer_note', lang, {
                  ltaNumber: lta.ltaNumber,
                }),
                createdAt: now,
                updatedAt: now,
              });
            }
            await this.shipmentRepo.update(
              { id: item.shipment.id },
              { status: ShipmentStatus.AT_ORIGIN_AGENCY, updatedAt: now },
            );
          }
        }
      }
    } catch (error) {
      console.error(error);
      throw new InternalServerErrorException(
        await this.i18n.translate('lta.status_change_error', lang),
      );
    }

    const updatedLta = await this.ltaRepository.findOne({
      where: { id: lta.id },
      relations: ['ltaShipments', 'tracking'],
    });
    return {
      message: await this.i18n.translate('lta.status_updated', lang, {
        status: newStatus,
      }),
      data: updatedLta!,
    };
  }

  async getLtaBalance(
    ltaId: string,
    lang: string = 'fr',
  ): Promise<{
    message: string;
    data: {
      total: number;
      retirer: number;
      reste: number;
    };
  }> {
    const result = await this.ltaShipmentRepository
      .createQueryBuilder('ls')
      .innerJoin('ls.shipment', 'shipment')
      .select([
        `
      SUM(
        COALESCE(shipment.shippingPrice, 0) +
        COALESCE(shipment.deliveryPrice, 0)
      ) AS total
      `,
        `
      SUM(
        CASE 
          WHEN shipment.paid = true
          THEN COALESCE(shipment.shippingPrice, 0) + COALESCE(shipment.deliveryPrice, 0)
          ELSE 0
        END
      ) AS retirer
      `,
      ])
      .where('ls.ltaId = :ltaId', { ltaId })
      .getRawOne();
    const total = Number(result?.total) || 0;
    const retirer = Number(result?.retirer) || 0;
    const reste = total - retirer;
    return {
      message: await this.i18n.translate('lta.balance_success', lang),
      data: { total, retirer, reste },
    };
  }

  async getLtaBalanceWithHistory(
    ltaId: string,
    lang: string = 'fr',
  ): Promise<any> {
    const balanceResult = await this.getLtaBalance(ltaId, lang);
    const shipments = await this.shipmentRepo
      .createQueryBuilder('shipment')
      .innerJoin('shipment.ltaShipments', 'lta')
      .where('lta.ltaId = :ltaId', { ltaId })
      .andWhere('shipment.paid = true')
      // .andWhere('shipment.collectedAt IS NOT NULL')
      // .andWhere('shipment.status = :collectedStatus', {
      //   collectedStatus: ShipmentStatus.COLLECTED,
      // })
      .orderBy('shipment.collectedAt', 'DESC')
      .leftJoinAndSelect('shipment.package', 'package')
      .getMany();

    const historique = await Promise.all(
      shipments.map(async (s) => {
        const operation = await this.operationRepo.findOne({
          where: { shipmentId: s.id },
        });
        return {
          customerName: s.clientName || (await this.i18n.translate('lta.not_provided', lang)),
          customerPhone: s.clientPhone || (await this.i18n.translate('lta.not_provided', lang)),
          collectedAt: s.collectedAt,
          paid: s.paid,
          amount: s.shippingPrice,
          status: s.status,
          paymentMethod: operation?.paymentMethod || (await this.i18n.translate('lta.not_defined', lang)),
          reference: operation?.reference || (await this.i18n.translate('lta.not_defined', lang)),
          shipment: s,
        };
      }),
    );

    return {
      message: balanceResult.message,
      data: {
        balance: balanceResult.data,
        historique,
      },
    };
  }
}