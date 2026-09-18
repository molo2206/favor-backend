/* eslint-disable @typescript-eslint/no-unused-vars */
// src/cron/company-fee.cron.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan } from 'typeorm';
import {
  CompanyEntity,
  FeeBasis,
  FeeType,
} from 'src/company/entities/company.entity';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import moment from 'moment';
import {
  CompanyTransactionEntity,
  TransactionStatus,
  TransactionType,
} from 'src/Company-transaction/entity/company-transaction.entity';
import { CompanyStatus } from 'src/company/enum/company-status.enum';

// Dictionnaire interne des traductions pour les notifications
const translations: Record<string, Record<string, string>> = {
  'cron.fee.monthly_fee_subject': {
    fr: 'Frais mensuels - {period}',
    en: 'Monthly fee - {period}',
    sw: 'Ada ya mwezi - {period}',
    es: 'Tarifa mensual - {period}',
    ar: 'الرسوم الشهرية - {period}',
  },
  'cron.fee.monthly_fee_body': {
    fr: 'Bonjour, les frais mensuels de votre entreprise pour la période {period} s’élèvent à {amount} {currency}. Veuillez procéder au paiement.',
    en: 'Hello, the monthly fees for your company for the period {period} amount to {amount} {currency}. Please proceed with the payment.',
    sw: 'Habari, ada ya mwezi ya kampuni yako kwa kipindi cha {period} ni {amount} {currency}. Tafadhali fanya malipo.',
    es: 'Hola, las tarifas mensuales de su empresa para el período {period} ascienden a {amount} {currency}. Por favor, proceda al pago.',
    ar: 'مرحباً، الرسوم الشهرية لشركتك عن الفترة {period} تبلغ {amount} {currency}. يرجى المتابعة بالسداد.',
  },
  'cron.fee.overdue_subject': {
    fr: 'Transaction en retard - {reference}',
    en: 'Overdue transaction - {reference}',
    sw: 'Muamala uliochelewa - {reference}',
    es: 'Transacción vencida - {reference}',
    ar: 'معاملة متأخرة - {reference}',
  },
  'cron.fee.overdue_body': {
    fr: 'Bonjour, votre transaction {reference} est en retard de plus de 30 jours. Veuillez régulariser votre situation dès que possible.',
    en: 'Hello, your transaction {reference} is overdue by more than 30 days. Please settle your situation as soon as possible.',
    sw: 'Habari, muamala wako {reference} umechelewa kwa zaidi ya siku 30. Tafadhali suluhisha hali yako haraka iwezekanavyo.',
    es: 'Hola, su transacción {reference} está vencida por más de 30 días. Por favor, regularice su situación lo antes posible.',
    ar: 'مرحباً، معاملتك {reference} متأخرة لأكثر من 30 يومًا. يرجى تسوية وضعك في أقرب وقت ممكن.',
  },
};

@Injectable()
export class CompanyFeeCronService {
  private readonly logger = new Logger(CompanyFeeCronService.name);

  constructor(
    @InjectRepository(CompanyEntity)
    private readonly companyRepository: Repository<CompanyEntity>,
    @InjectRepository(CompanyTransactionEntity)
    private readonly transactionRepository: Repository<CompanyTransactionEntity>,
    @InjectRepository(LtaEntity)
    private readonly ltaRepository: Repository<LtaEntity>,
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
  ) { }

  private translate(key: string, lang: string, params?: any): string {
    let text = translations[key]?.[lang];
    if (!text) {
      console.warn(`Missing translation for key: ${key}, lang: ${lang}`);
      return key;
    }
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`{${k}}`, 'g'), String(v));
      });
    }
    return text;
  }

  /**
   * Cron job exécuté le premier jour de chaque mois à 00:00
   * Pour générer les frais mensuels des entreprises
   */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async generateMonthlyFees() {
    this.logger.log(' Début de la génération des frais mensuels...');
    const currentPeriod = moment().subtract(1, 'month').format('YYYY-MM');
    const startDate = moment().subtract(1, 'month').startOf('month').toDate();
    const endDate = moment().subtract(1, 'month').endOf('month').toDate();

    try {
      // Récupérer toutes les entreprises actives avec frais mensuels
      const companies = await this.companyRepository.find({
        where: {
          status: CompanyStatus.VALIDATED,
          feeB: FeeBasis.MONTH,
        },
        relations: ['userHasCompany', 'userHasCompany.user'],
      });
      this.logger.log(
        `${companies.length} entreprises avec frais mensuels trouvées`,
      );

      let totalGenerated = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      for (const company of companies) {
        try {
          // Vérifier si les frais du mois ont déjà été générés
          const existingTransaction = await this.transactionRepository.findOne({
            where: {
              companyId: company.id,
              period: currentPeriod,
              referenceType: 'MONTHLY_FEE',
              status: TransactionStatus.PENDING,
            },
          });

          if (existingTransaction) {
            this.logger.warn(
              ` Frais mensuels déjà générés pour ${company.companyName} (${currentPeriod})`,
            );
            totalSkipped++;
            continue;
          }

          // Calculer le montant des frais mensuels
          let monthlyAmount = company.fee || 0;

          // Si le montant est 0, on peut calculer basé sur l'activité du mois
          if (monthlyAmount === 0) {
            monthlyAmount = await this.calculateMonthlyFeeFromActivity(
              company,
              startDate,
              endDate,
            );
          }

          if (monthlyAmount <= 0) {
            this.logger.log(
              ` Aucun frais mensuel pour ${company.companyName} (${currentPeriod})`,
            );
            totalSkipped++;
            continue;
          }

          // Créer la transaction
          const transaction = this.transactionRepository.create({
            companyId: company.id,
            company: company,
            amount: monthlyAmount,
            type: TransactionType.DEBIT,
            status: TransactionStatus.PENDING,
            description: `Frais mensuels d'abonnement - ${currentPeriod}`,
            referenceType: 'MONTHLY_FEE',
            period: currentPeriod,
            feeBasis: FeeBasis.MONTH,
            feeType: company.feeType || FeeType.FIXED,
            metadata: {
              companyName: company.companyName,
              period: currentPeriod,
              calculationMethod: company.feeType,
              appliedRate: company.fee,
              startDate: startDate,
              endDate: endDate,
            },
            paid: false,
          });

          await this.transactionRepository.save(transaction);

          // Envoyer une notification à l'entreprise (traduite)
          await this.notifyCompanyAboutFee(
            company,
            monthlyAmount,
            currentPeriod,
          );

          totalGenerated++;
          this.logger.log(
            ` Frais mensuels générés pour ${company.companyName}: ${monthlyAmount} ${company.localCurrency || 'USD'}`,
          );
        } catch (error) {
          totalErrors++;
          this.logger.error(
            ` Erreur pour ${company.companyName}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `🎉 Génération des frais terminée: ${totalGenerated} générés, ${totalSkipped} ignorés, ${totalErrors} erreurs`,
      );
    } catch (error) {
      this.logger.error(`❌ Erreur globale du cron: ${error.message}`);
    }
  }

  /**
   * Calculer les frais mensuels basés sur l'activité de l'entreprise
   */
  private async calculateMonthlyFeeFromActivity(
    company: CompanyEntity,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    let totalAmount = 0;

    // Compter les LTA du mois
    const ltaCount = await this.ltaRepository.count({
      where: {
        shipperId: company.id,
        createdAt: Between(startDate, endDate),
      },
    });

    // Compter les shipments du mois
    const shipmentCount = await this.shipmentRepository.count({
      where: [
        {
          pickupCompanyId: company.id,
          createdAt: Between(startDate, endDate),
        },
        {
          shippingCompanyId: company.id,
          createdAt: Between(startDate, endDate),
        },
        {
          deliveryCompanyId: company.id,
          createdAt: Between(startDate, endDate),
        },
      ],
    });

    if (company.feeB === FeeBasis.WAYBILL) {
      totalAmount = (company.fee || 0) * ltaCount;
    } else if (company.feeB === FeeBasis.SHIPMENT) {
      totalAmount = (company.fee || 0) * shipmentCount;
    } else {
      totalAmount = company.fee || 0;
    }

    if (company.feeType === FeeType.PERCENT) {
      const revenue = await this.calculateMonthlyRevenue(
        company.id,
        startDate,
        endDate,
      );
      totalAmount = (company.fee / 100) * revenue;
    }

    return totalAmount;
  }

  /**
   * Calculer le chiffre d'affaires mensuel de l'entreprise
   */
  private async calculateMonthlyRevenue(
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const result = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select('SUM(transaction.amount)', 'total')
      .where('transaction.companyId = :companyId', { companyId })
      .andWhere('transaction.type = :type', { type: TransactionType.CREDIT })
      .andWhere('transaction.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('transaction.status = :status', {
        status: TransactionStatus.COMPLETED,
      })
      .getRawOne();

    return Number(result?.total || 0);
  }

  /**
   * Envoyer une notification à l'entreprise concernant les frais
   * (email et SMS traduits selon la langue de l'utilisateur)
   */
  private async notifyCompanyAboutFee(
    company: CompanyEntity,
    amount: number,
    period: string,
  ): Promise<void> {
    const owners = company.userHasCompany?.filter((uhc) => uhc.isOwner) || [];
    const currency = company.localCurrency || 'USD';

    for (const owner of owners) {
      const user = owner.user;
      if (!user) continue;
      const lang = user.settings.language || 'fr';

      const subject = this.translate('cron.fee.monthly_fee_subject', lang, {
        period,
      });
      const body = this.translate('cron.fee.monthly_fee_body', lang, {
        period,
        amount,
        currency,
      });

      if (user.email) {
        // Ici vous pouvez envoyer un email via MailService
        this.logger.log(
          `📧 [${lang}] Email envoyé à ${user.email} : ${subject}`,
        );
        // Exemple: await this.mailService.sendEmail(user.email, subject, body);
      }
      if (user.phone) {
        // Ici vous pouvez envoyer un SMS via SmsHelper
        this.logger.log(`📱 [${lang}] SMS envoyé à ${user.phone} : ${body}`);
        // Exemple: await this.smsHelper.sendSms(user.phone, body);
      }
    }
  }

  /**
   * Cron job pour relancer les transactions échouées (toutes les heures)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async retryFailedTransactions() {
    this.logger.log('🔄 Vérification des transactions échouées...');

    const failedTransactions = await this.transactionRepository.find({
      where: {
        status: TransactionStatus.FAILED,
        paid: false,
      },
      relations: ['company'],
    });

    for (const transaction of failedTransactions) {
      this.logger.log(
        `🔄 Retry transaction ${transaction.id} pour ${transaction.company?.companyName}`,
      );
      // Logique de retry (à implémenter)
    }
  }

  /**
   * Cron job pour marquer les transactions impayées comme en retard (chaque jour à 08:00)
   */
  @Cron('0 8 * * *')
  async checkOverdueTransactions() {
    this.logger.log('🔄 Vérification des transactions en retard...');

    const thirtyDaysAgo = moment().subtract(30, 'days').toDate();

    const overdueTransactions = await this.transactionRepository.find({
      where: {
        status: TransactionStatus.PENDING,
        paid: false,
        createdAt: LessThan(thirtyDaysAgo),
      },
      relations: ['company', 'company.userHasCompany', 'company.userHasCompany.user'],
    });

    for (const transaction of overdueTransactions) {
      this.logger.warn(
        `⚠️ Transaction en retard: ${transaction.id} pour ${transaction.company?.companyName}`,
      );

      const company = transaction.company;
      if (!company) continue;

      const owners = company.userHasCompany?.filter((uhc) => uhc.isOwner) || [];

      for (const owner of owners) {
        const user = owner.user;
        if (!user) continue;
        const lang = user.settings.language || 'fr';

        const subject = this.translate('cron.fee.overdue_subject', lang, {
          reference: transaction.id,
        });
        const body = this.translate('cron.fee.overdue_body', lang, {
          reference: transaction.id,
        });

        if (user.email) {
          this.logger.log(
            `📧 [${lang}] Rappel envoyé à ${user.email} pour transaction ${transaction.id}`,
          );
        }
        if (user.phone) {
          this.logger.log(
            `📱 [${lang}] SMS rappel envoyé à ${user.phone} pour transaction ${transaction.id}`,
          );
        }
      }
    }
  }
}