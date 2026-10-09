/* eslint-disable prefer-const */
import { ConfigService } from '@nestjs/config';
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Inject,
  forwardRef,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from './entities/user.entity';
import { OtpEntity } from 'src/otp/entities/otp.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { validate } from 'class-validator';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { VerifyOtpDto } from 'src/otp/dto/verify-otp.dto';
import { ResetPasswordDto } from 'src/otp/dto/reset-password.dto';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { UpdateUserDto } from './dto/update-profile';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from './enum/user-role-enum';
import { CloudinaryService } from './utility/helpers/cloudinary.service';
import { MailService } from 'src/email/email.service';
import { GoogleLoginDto } from './dto/googleLoginDto.dto';
import { SmsHelper } from './utility/helpers/sms.helper';
import validator from 'validator';
import { Resource } from 'src/ressource/entity/resource.entity';
import { UserHasResourceEntity } from './entities/user-has-resource.entity';
import { DeviceToken } from 'src/firebase/entities/device-token.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { FilesService } from 'src/files/files.service';
import { UserSettingsEntity } from './entities/user-settings.entity';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { I18nService } from 'src/libs/common/src';
import { LoyaltyTier, UserLoyaltyEntity } from './entities/user-loyalty.entity';
import { v4 as uuidv4 } from 'uuid';
import { ReferralEntity, ReferralStatus } from './entities/referral.entity';
import { OrderStatus } from 'src/order/enum/order.status.enum';
import { FpayService } from 'src/fpay/fpay.service';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { CreateUserByAdminDto } from './dto/create-user-by-admin.dto';
import { UpdateUserByAdminDto } from './dto/update-user-by-admin.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(OtpEntity)
    private readonly otpRepository: Repository<OtpEntity>,

    @InjectRepository(Resource)
    private readonly resourcesRepository: Repository<Resource>,

    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepo: Repository<DeviceToken>,

    @InjectRepository(ReferralEntity)
    private readonly referralRepository: Repository<ReferralEntity>,
    @InjectRepository(UserHasResourceEntity)
    private readonly userHasResourceRepository: Repository<UserHasResourceEntity>,
    @InjectRepository(CompanyEntity)
    private readonly companyRepository: Repository<CompanyEntity>,

    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly cloudinary: CloudinaryService,
    private readonly mailService: MailService,
    private readonly smsHelper: SmsHelper,
    private readonly filesService: FilesService,

    @InjectRepository(UserSettingsEntity)
    private readonly settingsRepo: Repository<UserSettingsEntity>,



    @InjectRepository(UserLoyaltyEntity)
    private readonly loyaltyRepository: Repository<UserLoyaltyEntity>,



    private readonly i18n: I18nService,

    @Inject(forwardRef(() => FpayService))  // âœ… Utiliser forwardRef
    private readonly fpayService: FpayService,
  ) { }

  private async generateReferralCode(
    userId: string,
    existingCodes?: string[],
  ): Promise<string> {
    const userIdShort = userId.substring(0, 4).toUpperCase();

    let code: string;
    let exists = true;
    let attempts = 0;
    const maxAttempts = 10;

    // âœ… Liste des codes dÃ©jÃ  connus (fournie par l'appelant)
    const codesToCheck = new Set(existingCodes || []);

    do {
      const random = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase()
        .padStart(6, '0');

      code = `${userIdShort}${random}`;

      // âœ… VÃ©rif rapide locale d'abord (Set O(1) au lieu de Array.includes)
      if (codesToCheck.has(code)) {
        attempts++;
        continue;
      }

      // âœ… VÃ©rif DB uniquement si pas dans la liste locale
      const existingUser = await this.usersRepository.findOne({
        where: { referralCode: code },
        select: ['id'],   // âœ… AJOUT : ne rÃ©cupÃ¨re que l'id (plus rapide)
      });

      exists = !!existingUser;
      attempts++;

    } while (exists && attempts < maxAttempts);

    // âœ… Fallback si collision aprÃ¨s 10 tentatives
    if (exists) {
      const timestamp = Date.now().toString(36).toUpperCase();
      const randomSuffix = Math.random()
        .toString(36)
        .substring(2, 4)
        .toUpperCase();
      code = `${timestamp.slice(-6)}${randomSuffix}`;

      const existingUser = await this.usersRepository.findOne({
        where: { referralCode: code },
        select: ['id'],
      });

      if (existingUser) {
        const uuidPart = uuidv4().substring(0, 8).toUpperCase();
        code = `${uuidPart}`;
      }
    }

    return code;
  }

  private async getOrCreateLoyaltyAccount(userId: string): Promise<UserLoyaltyEntity> {
    // âœ… 1. VÃ‰RIFIER SI Ã‡A EXISTE
    const existingLoyalty = await this.loyaltyRepository.findOne({
      where: { userId },
    });

    // âœ… 2. SI EXISTE â†’ NE PAS CRÃ‰ER, RETOURNER
    if (existingLoyalty) {
      return existingLoyalty;
    }

    // âœ… 3. SINON â†’ GÃ‰NÃ‰RER UN CODE UNIQUE ET CRÃ‰ER
    let code: string;
    let exists: UserLoyaltyEntity | null = null;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      code = Math.floor(10000000 + Math.random() * 90000000).toString();
      exists = await this.loyaltyRepository.findOne({
        where: { loyaltyCode: code },
        select: ['id'],   // âœ… AJOUT : ne rÃ©cupÃ¨re que l'id
      });
      attempts++;
    } while (exists && attempts < maxAttempts);

    if (exists) {
      code = Date.now().toString().slice(-8);
    }

    const loyalty = this.loyaltyRepository.create({
      userId,
      loyaltyCode: code,
      pointsBalance: 0,
      pointsTotalEarned: 0,
      pointsTotalSpent: 0,
      currentTier: LoyaltyTier.BRONZE,
      isActive: true,
    });

    try {
      return await this.loyaltyRepository.save(loyalty);
    } catch (error: any) {
      // âœ… 4. Si erreur de doublon (concurrence) â†’ retourner l'existant
      if (error.code === 'ER_DUP_ENTRY' || error.message?.includes('Duplicate')) {
        const existing = await this.loyaltyRepository.findOne({
          where: { userId },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
    lang: string = 'fr',
  ): Promise<{ message: string }> {
    const { currentPassword, newPassword } = changePasswordDto;
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'password'],
    });

    if (!user) {
      throw new NotFoundException(
        await this.i18n.translate('user.user_not_found', lang),
      );
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException(
        await this.i18n.translate('user.current_password_incorrect', lang),
      );
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await this.usersRepository.save(user);

    return {
      message: await this.i18n.translate('user.password_updated', lang),
    };
  }

  async signup(
    createUserDto: CreateUserDto,
    lang: string = 'fr',
  ): Promise<{
    message: string;
    data: Omit<UserEntity, 'password'> | { email?: string; phone?: string };
    access_token: string | null;
    refresh_token: string | null;
    fcmToken?: string;
    platform?: 'ios' | 'android' | 'web';
  }> {
    const {
      email,
      phone,
      otpCode,
      password,
      fcmToken: clientFcmToken,
      platform,
      referralCode,
    } = createUserDto;

    const hasEmail = email && email !== '';
    const hasPhone = phone && phone !== '';

    if (!hasEmail && !hasPhone) {
      throw new BadRequestException(
        await this.i18n.translate('user.email_or_phone_required', lang),
      );
    }

    if (hasEmail && !validator.isEmail(email)) {
      throw new BadRequestException(
        await this.i18n.translate('user.valid_email', lang),
      );
    }

    if (hasPhone && !validator.isMobilePhone(phone, 'any')) {
      throw new BadRequestException(
        await this.i18n.translate('user.valid_phone', lang),
      );
    }

    const destination = email || phone;
    if (!destination) {
      throw new BadRequestException(
        await this.i18n.translate('user.email_or_phone_required', lang),
      );
    }

    // ============================================================
    // âœ… VÃ‰RIFICATION DU CODE DE PARRAINAGE
    // ============================================================
    let referrer: UserEntity | null = null;

    if (referralCode) {
      referrer = await this.usersRepository.findOne({
        where: { referralCode },
      });

      if (!referrer) {
        throw new BadRequestException(
          await this.i18n.translate('referral.invalid_code', lang)
        );
      }

      if (!referrer.isActive || referrer.deleted) {
        throw new BadRequestException(
          await this.i18n.translate('referral.referrer_inactive', lang)
        );
      }

      if (email && referrer.email === email) {
        throw new BadRequestException(
          await this.i18n.translate('referral.self_referral_not_allowed', lang)
        );
      }

      if (phone && referrer.phone === phone) {
        throw new BadRequestException(
          await this.i18n.translate('referral.self_referral_not_allowed', lang)
        );
      }
    }

    // ============================================================
    // 1ï¸âƒ£ VÃ©rification doublons
    // âœ… OPTIMISATION : select uniquement id (plus rapide)
    // ============================================================
    const userExists = await this.usersRepository.findOne({
      where: [{ email: email || undefined }, { phone: phone || undefined }],
      select: ['id'],
    });

    if (userExists) {
      throw new BadRequestException(
        await this.i18n.translate('user.account_exists', lang),
      );
    }

    // ============================================================
    // 2ï¸âƒ£ Envoi OTP si non fourni
    // ============================================================
    if (!otpCode) {
      const generatedOtpCode = Math.floor(
        1000 + Math.random() * 9000,
      ).toString();
      const otp = this.otpRepository.create({
        email: destination,
        otpCode: generatedOtpCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      await this.otpRepository.save(otp);

      if (validator.isEmail(destination)) {
        const translations = {
          title: await this.i18n.translate('email.otp.title', lang),
          description: await this.i18n.translate('email.otp.description', lang),
          label: await this.i18n.translate('email.otp.label', lang),
          expiry: await this.i18n.translate('email.otp.expiry', lang),
          footerCopyright: await this.i18n.translate('email.otp.footerCopyright', lang),
          footerSecurity: await this.i18n.translate('email.otp.footerSecurity', lang),
          legalNote: await this.i18n.translate('email.otp.legalNote', lang),
        };
        await this.mailService.sendHtmlEmail(
          destination,
          await this.i18n.translate('user.otp_code_subject', lang),
          'sendOtp.html',
          {
            otpCode: generatedOtpCode,
            year: new Date().getFullYear(),
            lang: lang,
            translations: translations,
          },
        );
      } else if (validator.isMobilePhone(destination, 'any')) {
        const smsMessage = await this.i18n.translate('user.otp_sms_body', lang, {
          otpCode: generatedOtpCode,
        });
        const sent = await this.smsHelper.sendSms(destination, smsMessage);
        if (!sent) {
          throw new BadRequestException(
            await this.i18n.translate('user.sms_send_failed', lang),
          );
        }
      }

      return {
        message: validator.isEmail(destination)
          ? await this.i18n.translate('user.otp_sent_email', lang)
          : await this.i18n.translate('user.otp_sent_sms', lang),
        data: { ...(email ? { email } : {}), ...(phone ? { phone } : {}) },
        access_token: null,
        refresh_token: null,
      };
    }

    // ============================================================
    // 3ï¸âƒ£ VÃ©rification OTP
    // âœ… OPTIMISATION : select uniquement les champs utiles
    // ============================================================
    const otpEntry = await this.otpRepository.findOne({
      where: { email: destination, otpCode, isUsed: false },
    });
    if (!otpEntry || new Date() > otpEntry.expiresAt) {
      throw new BadRequestException(
        await this.i18n.translate('user.invalid_otp', lang),
      );
    }

    // ============================================================
    // 4ï¸âƒ£ CRÃ‰ATION UTILISATEUR
    // âœ… OPTIMISATION : un seul save (avec referralCode gÃ©nÃ©rÃ© avant)
    // ============================================================
    const hashedPassword = password
      ? await bcrypt.hash(password, 10)
      : undefined;

    // âœ… GÃ©nÃ©rer un referralCode AVANT le save (utilise l'id aprÃ¨s crÃ©ation)
    // On sauvegarde d'abord pour avoir l'id, puis on met Ã  jour.
    const newUser = this.usersRepository.create({
      fullName: createUserDto.fullName,
      email: email || undefined,
      phone: phone || undefined,
      password: hashedPassword,
      role: UserRole.CUSTOMER,
      isActive: true,
      provider: 'otp',
      country: createUserDto.country,
      city: createUserDto.city,
      fcmToken: clientFcmToken,
      // referralCode assignÃ© plus bas aprÃ¨s gÃ©nÃ©ration
    });

    const savedUser = await this.usersRepository.save(newUser);

    // ============================================================
    // ðŸ”¥ GÃ‰NÃ‰RATION DU CODE DE PARRAINAGE
    // âœ… OPTIMISATION : 1 seul save (au lieu de 2)
    // ============================================================
    const referralCodeGenerated = await this.generateReferralCode(savedUser.id);
    savedUser.referralCode = referralCodeGenerated;

    // âœ… NE PAS save ici - on save plus bas une seule fois

    // ============================================================
    // âœ… TRAITEMENT DU PARRAINAGE
    // ============================================================
    if (referralCode && referrer) {
      if (referrer.id === savedUser.id) {
        throw new BadRequestException(
          await this.i18n.translate('referral.self_referral_not_allowed', lang)
        );
      }

      // âœ… Mettre Ã  jour le parrain
      referrer.referralCount = (referrer.referralCount || 0) + 1;
      referrer.lastReferralDate = new Date();

      // âœ… Lier le nouvel utilisateur au parrain (avant le save final)
      savedUser.referredBy = referrer.id;
    }

    // âœ… UN SEUL save pour : referralCode + referredBy
    await this.usersRepository.save(savedUser);

    // âœ… Sauvegarder le parrain sÃ©parÃ©ment (seulement si modifiÃ©)
    if (referralCode && referrer) {
      await this.usersRepository.save(referrer);

      // âœ… CrÃ©er l'historique de parrainage
      const referral = this.referralRepository.create({
        referrerId: referrer.id,
        referredId: savedUser.id,
        referralCode: referralCode,
        status: ReferralStatus.COMPLETED,
        rewardAmount: 0,
        rewardType: 'POINTS',
        completedAt: new Date(),
      });
      await this.referralRepository.save(referral);
    }

    // ============================================================
    // 5ï¸âƒ£ CRÃ‰ATION DU COMPTE FIDÃ‰LITÃ‰
    // ============================================================
    const loyalty = await this.getOrCreateLoyaltyAccount(savedUser.id);
    await this.loyaltyRepository.save(loyalty);

    // ============================================================
    // 6ï¸âƒ£ GESTION DU FCM TOKEN
    // âœ… OPTIMISATION : assigner directement (sans variable intermÃ©diaire inutile)
    // ============================================================
    let savedFcmToken: string | undefined;
    if (clientFcmToken && platform) {
      const existingToken = await this.deviceTokenRepo.findOne({
        where: { token: clientFcmToken },
        select: ['id'],   // âœ… OPTIMISATION
      });

      if (existingToken) {
        await this.deviceTokenRepo.update(
          { token: clientFcmToken },
          {
            userId: savedUser.id,
            platform,
            updatedAt: new Date(),
          },
        );
      } else {
        const newToken = this.deviceTokenRepo.create({
          token: clientFcmToken,
          userId: savedUser.id,
          platform,
        });
        await this.deviceTokenRepo.save(newToken);
        savedFcmToken = newToken.token;
      }
    }

    // ============================================================
    // 7ï¸âƒ£ MARQUER L'OTP COMME UTILISÃ‰
    // ============================================================
    otpEntry.isUsed = true;
    otpEntry.user = savedUser;
    await this.otpRepository.save(otpEntry);

    // ============================================================
    // 8ï¸âƒ£ RECHARGER L'UTILISATEUR AVEC SES RELATIONS
    // âœ… OPTIMISATION : ne charger QUE les relations rÃ©ellement utilisÃ©es
    // ============================================================
    const userFull = await this.usersRepository.findOne({
      where: { id: savedUser.id },
      relations: [
        'activeCompany',
        'activeCompany.country',
        'activeCompany.city',
        'userHasCompany',
        'userHasCompany.company',
        'userHasCompany.company.tauxCompanies',
        'userPlatformRoles',
        'userPlatformRoles.platform',
        'userPlatformRoles.role',
        'loyalty',
      ],
    });
    if (!userFull)
      throw new NotFoundException(
        await this.i18n.translate('user.user_not_found', lang),
      );

    const { password: _pw, ...userWithoutPassword } = userFull;

    // ============================================================
    // 9ï¸âƒ£ ENVOI EMAIL DE BIENVENUE
    // âœ… OPTIMISATION : en ARRIÃˆRE-PLAN (non bloquant)
    // ============================================================
    if (email && email !== '' && validator.isEmail(email)) {
      // âœ… PrÃ©parer les donnÃ©es maintenant (capturÃ©es par closure)
      const userData = {
        fullName:
          userWithoutPassword.fullName ||
          userWithoutPassword.email ||
          'Utilisateur',
        email: userWithoutPassword.email || 'Non renseignÃ©',
        phone: userWithoutPassword.phone || 'Non renseignÃ©',
        role: userWithoutPassword.role || 'Client',
        referralCode: savedUser.referralCode,
        createdAt: userWithoutPassword.createdAt
          ? new Date(
            typeof userWithoutPassword.createdAt === 'string'
              ? userWithoutPassword.createdAt
              : (userWithoutPassword.createdAt as any).toDate?.() ||
              userWithoutPassword.createdAt,
          ).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
          : "Aujourd'hui",
      };

      // âœ… Envoi en arriÃ¨re-plan (non bloquant)
      (async () => {
        try {
          const emailTranslations = {
            welcome_title: await this.i18n.translate('user.welcome_title', lang),
            welcome_subtitle: await this.i18n.translate('user.welcome_subtitle', lang),
            account_created: await this.i18n.translate('user.account_created', lang),
            email_label: await this.i18n.translate('user.email_label', lang),
            phone_label: await this.i18n.translate('user.phone_label', lang),
            role_label: await this.i18n.translate('user.role_label', lang),
            date_label: await this.i18n.translate('user.date_label', lang),
            discover_platform: await this.i18n.translate('user.discover_platform', lang),
            contact_whatsapp: await this.i18n.translate('user.contact_whatsapp', lang),
            need_help: await this.i18n.translate('user.need_help', lang),
            contact_us: await this.i18n.translate('user.contact_us', lang),
            footer_copyright: await this.i18n.translate('user.footer_copyright', lang),
            footer_legal: await this.i18n.translate('user.footer_legal', lang),
            referral_code_title: await this.i18n.translate('referral.referral_code_title', lang),
            share_referral: await this.i18n.translate('referral.share_referral', lang),
          };

          await this.mailService.sendHtmlEmail(
            email,
            await this.i18n.translate('user.welcome_subject', lang),
            'createCount.html',
            {
              user: userData,
              appUrl: process.env.APP_URL || 'https://favorhelp.com',
              year: new Date().getFullYear(),
              translations: emailTranslations,
              lang: lang,
            },
          );
        } catch (err: any) {
          console.error('âŒ [signup] Welcome email error:', err.message);
        }
      })();
    }

    // ============================================================
    // ðŸ”Ÿ GÃ‰NÃ‰RATION DES TOKENS
    // âœ… OPTIMISATION : Promise.all
    // ============================================================
    const [access_token, refresh_token] = await Promise.all([
      this.accessToken(savedUser),
      this.refreshToken(savedUser),
    ]);

    return {
      message: await this.i18n.translate('user.signup_success', lang),
      data: {
        ...userWithoutPassword,
        referralCode: savedUser.referralCode,
      },
      access_token,
      refresh_token,
      fcmToken: savedFcmToken,
      platform,
    };
  }
  async signin(userSignInDto: LoginUserDto, lang: string = 'fr'): Promise<any> {
    console.log('ðŸ” Langue reÃ§ue dans signin :', lang);
    const { fcmToken, platform } = userSignInDto;

    // ============================================================
    // â±ï¸ TIMERS DEBUG (Ã  retirer en prod si nÃ©cessaire)
    // ============================================================
    console.time('â±ï¸ signin TOTAL');
    console.time('â±ï¸ 1. query user');

    let user = await this.usersRepository
      .createQueryBuilder('users')
      .addSelect('users.password')
      .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('company.companyResources', 'companyResources')
      .leftJoinAndSelect('companyResources.resource', 'resource')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('company.settings', 'companySettings')
      .leftJoinAndSelect('company.invoiceConfiguration', 'invoiceConfiguration')
      .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
      .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
      .leftJoinAndSelect('userPlatformRoles.role', 'role')
      .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
      .leftJoinAndSelect('defaultAddress.country', 'defaultAddressCountry')
      .leftJoinAndSelect('defaultAddress.city', 'defaultAddressCity')
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .leftJoinAndSelect('users.activeBranch', 'activeBranch')
      .leftJoinAndSelect('activeBranch.country', 'activeBranchCountry')
      .leftJoinAndSelect('activeBranch.city', 'activeBranchCity')
      .leftJoinAndSelect('users.loyalty', 'loyalty')
      .leftJoinAndSelect('users.referrals', 'referrals')
      .leftJoinAndSelect('users.referrer', 'referrer')
      .where('users.email = :login OR users.phone = :login', {
        login: userSignInDto.email,
      })
      .getOne();

    console.timeEnd('â±ï¸ 1. query user');

    if (!user) {
      throw new BadRequestException(
        await this.i18n.translate('user.user_not_found', lang),
      );
    }

    if (user.deleted) {
      throw new BadRequestException(
        await this.i18n.translate('user.account_deleted', lang),
      );
    }

    console.time('â±ï¸ 2. bcrypt');
    const isPasswordValid = await bcrypt.compare(
      userSignInDto.password,
      user.password,
    );
    console.timeEnd('â±ï¸ 2. bcrypt');

    if (!isPasswordValid) {
      throw new BadRequestException(
        await this.i18n.translate('user.password_incorrect', lang),
      );
    }

    // ============================================================
    // ðŸ”¥ GARANTIR LE referralCode ET LE COMPTE FIDÃ‰LITÃ‰
    // âœ… OPTIMISÃ‰ : plus de reload lourd, on met Ã  jour localement
    // ============================================================
    console.time('â±ï¸ 3. referral + loyalty');

    // ðŸ”¹ ReferralCode manquant
    if (!user.referralCode || user.referralCode.trim() === '') {
      console.warn(
        `âš ï¸ [signin] Utilisateur ${user.id} sans referralCode, gÃ©nÃ©ration...`,
      );

      // âœ… Utilise la mÃ©thode existante (elle gÃ¨re dÃ©jÃ  la boucle + fallback)
      const newCode = await this.generateReferralCode(user.id);

      if (!newCode || newCode.trim() === '') {
        console.error(
          `âŒ [signin] Impossible de gÃ©nÃ©rer un referralCode pour ${user.id}`,
        );
        throw new InternalServerErrorException(
          await this.i18n.translate('user.referral_code_generation_failed', lang),
        );
      }

      user.referralCode = newCode;
      await this.usersRepository.save(user);
      console.log(`âœ… [signin] referralCode gÃ©nÃ©rÃ©: ${newCode}`);
    }

    // ðŸ”¹ Loyalty manquante
    if (!user.loyalty || user.loyalty.length === 0) {
      const loyalty = await this.getOrCreateLoyaltyAccount(user.id);
      await this.loyaltyRepository.save(loyalty);

      // âœ… OPTIMISATION : assigner directement sans recharger
      user.loyalty = [loyalty];
    }

    console.timeEnd('â±ï¸ 3. referral + loyalty');

    // ============================================================
    // âœ… JWT : parallÃ©lisation
    // ============================================================
    console.time('â±ï¸ 4. JWT');
    const [access_token, refresh_token] = await Promise.all([
      this.accessToken(user),
      this.refreshToken(user),
    ]);
    console.timeEnd('â±ï¸ 4. JWT');

    const { password, ...userWithoutPassword } = user;

    // ============================================================
    // âœ… FCM token : en ARRIÃˆRE-PLAN (non bloquant)
    // ============================================================
    if (fcmToken && platform) {
      this.deviceTokenRepo
        .findOne({ where: { token: fcmToken } })
        .then(async (existingToken): Promise<void> => {
          if (existingToken) {
            await this.deviceTokenRepo.update(
              { token: fcmToken },
              {
                userId: user.id,
                platform,
                updatedAt: new Date(),
              },
            );
            return;
          }

          await this.deviceTokenRepo.save(
            this.deviceTokenRepo.create({
              token: fcmToken,
              userId: user.id,
              platform,
            }),
          );
        })
        .catch((err) =>
          console.error('âŒ [signin] FCM token save error:', err.message),
        );
    }
    const loyaltyPoints = user.loyalty?.[0]?.pointsBalance ?? 0;
    const loyaltyTier = user.loyalty?.[0]?.currentTier ?? null;
    const loyaltyCode = user.loyalty?.[0]?.loyaltyCode ?? null;

    // ============================================================
    // âœ… OPTIMISATION : activeCompany calculÃ©e depuis user.userHasCompany
    //    (plus de requÃªte SQL supplÃ©mentaire)
    // ============================================================
    console.time('â±ï¸ 5. build response');

    const userHasCompany =
      userWithoutPassword.userHasCompany?.map((uhc) => ({
        id: uhc.id,
        isOwner: uhc.isOwner,
        company: uhc.company
          ? {
            ...uhc.company,
            tauxCompanies: uhc.company.tauxCompanies ?? [],
            country: uhc.company.country ?? null,
            city: uhc.company.city ?? null,
            category: uhc.company.category ?? null,
            settings: (uhc.company as any).settings ?? null,
            invoiceConfiguration:
              (uhc.company as any).invoiceConfiguration ?? null,
          }
          : null,
        branch: uhc.branch
          ? {
            id: uhc.branch.id,
            name: uhc.branch.name,
          }
          : null,
        userResources:
          uhc.resources?.map((r) => ({
            id: r.id,
            canCreate: r.canCreate,
            canRead: r.canRead,
            canUpdate: r.canUpdate,
            canDelete: r.canDelete,
            canManage: r.canManage,
            status: r.status,
            resource: r.resource
              ? {
                id: r.resource.id,
                name: r.resource.name,
                label: r.resource.label,
              }
              : null,
          })) ?? [],
      })) ?? [];

    // âœ… RÃ©cupÃ©rer activeCompany depuis user (dÃ©jÃ  chargÃ©)
    const activeUserHasCompany = user.userHasCompany?.find(
      (uhc) => uhc.company?.id === user.activeCompanyId,
    );
    const activeCompanyEntity = activeUserHasCompany?.company ?? null;

    const userResourcesForActiveCompany =
      activeUserHasCompany?.resources?.map((r) => ({
        id: r.id,
        canCreate: r.canCreate,
        canRead: r.canRead,
        canUpdate: r.canUpdate,
        canDelete: r.canDelete,
        canManage: r.canManage,
        status: r.status,
        resource: r.resource
          ? {
            id: r.resource.id,
            name: r.resource.name,
            label: r.resource.label,
          }
          : null,
      })) ?? [];

    const activeCompanyBranch = activeUserHasCompany?.branch
      ? {
        id: activeUserHasCompany.branch.id,
        name: activeUserHasCompany.branch.name,
      }
      : null;

    const activeCompany = activeCompanyEntity
      ? {
        ...activeCompanyEntity,
        tauxCompanies: activeCompanyEntity.tauxCompanies ?? [],
        country: activeCompanyEntity.country ?? null,
        city: activeCompanyEntity.city ?? null,
        category: activeCompanyEntity.category ?? null,
        settings: (activeCompanyEntity as any).settings ?? null,
        invoiceConfiguration:
          (activeCompanyEntity as any).invoiceConfiguration ?? null,
        branch: activeCompanyBranch,
        companyResources:
          activeCompanyEntity.companyResources?.map((r) => ({
            id: r.id,
            canCreate: r.can_create,
            canRead: r.can_read,
            canUpdate: r.can_update,
            canDelete: r.can_delete,
            canManage: r.can_manage,
            status: r.status,
            resource: r.resource
              ? {
                id: r.resource.id,
                name: r.resource.name,
                label: r.resource.label,
              }
              : null,
          })) ?? [],
        userResources: userResourcesForActiveCompany,
        branches: (activeCompanyEntity.branches ?? []).map((b) => ({
          id: b.id,
          name: b.name,
          address: b.address,
          phone: b.phone,
          email: b.email,
          status: b.status,
          deleted: b.deleted,
          country: b.country
            ? { id: b.country.id, name: b.country.name }
            : null,
          city: b.city ? { id: b.city.id, name: b.city.name } : null,
        })),
      }
      : null;

    const userPlatformRoles =
      userWithoutPassword.userPlatformRoles?.map((upr: any) => ({
        id: upr.id,
        platform: upr.platform,
        role: upr.role,
      })) ?? [];

    const referralData = {
      referralCode: user.referralCode,
      referralCount: user.referralCount || 0,
      referralPoints: user.referralPoints || 0,
      referredBy: user.referredBy,
      referrerName: user.referrer?.fullName || null,
      referralActive: user.referralActive !== false,
      totalReferrals: user.referrals?.length || 0,
    };

    console.timeEnd('â±ï¸ 5. build response');

    console.timeEnd('â±ï¸ signin TOTAL');

    return {
      message: await this.i18n.translate('user.login_success', lang),
      data: instanceToPlain({
        ...userWithoutPassword,
        userHasCompany,
        activeCompany,
        userPlatformRoles,
        loyalty: {
          points: loyaltyPoints,
          tier: loyaltyTier,
          code: loyaltyCode,
        },
        referral: referralData,
      }),
      access_token,
      refresh_token,
      fcmToken,
    };
  }
  // ==================== GOOGLE LOGIN ====================
  async googleLoginByClientData(
    dto: GoogleLoginDto,
    lang: string = 'fr',
  ): Promise<{
    message: string;
    data: any;
    access_token: string;
    refresh_token: string;
    fcmToken?: string;
  }> {
    const { email, fullName, image, fcmToken, platform } = dto;
    if (!email)
      throw new BadRequestException(
        await this.i18n.translate('user.email_required', lang),
      );

    let user = await this.usersRepository
      .createQueryBuilder('users')
      .addSelect('users.password')
      .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('company.companyResources', 'companyResources')
      .leftJoinAndSelect('companyResources.resource', 'resource')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('company.settings', 'companySettings')
      .leftJoinAndSelect('company.invoiceConfiguration', 'invoiceConfiguration')
      .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
      .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
      .leftJoinAndSelect('userPlatformRoles.role', 'role')
      .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .leftJoinAndSelect('users.activeBranch', 'activeBranch')
      .leftJoinAndSelect('activeBranch.country', 'activeBranchCountry')
      .leftJoinAndSelect('activeBranch.city', 'activeBranchCity')
      .leftJoinAndSelect('users.loyalty', 'loyalty')
      .leftJoinAndSelect('users.referrals', 'referrals')
      .leftJoinAndSelect('users.referrer', 'referrer')
      .where('users.email = :email', { email: email.toLowerCase() })
      .getOne();

    let isNewUser = false;

    if (user) {
      console.log(`ðŸ” [googleLogin] Utilisateur existant: ${user.id}`);

      if (user.provider !== 'google' && user.password) {
        throw new BadRequestException(
          await this.i18n.translate('user.account_with_password_exists', lang),
        );
      }
      if (user.provider !== 'google') {
        await this.usersRepository.update(user.id, { provider: 'google' });
      }

      // ============================================================
      // ðŸ”¥ GARANTIR LE referralCode
      // âœ… OPTIMISATION : utilise directement generateReferralCode
      // ============================================================
      if (!user.referralCode || user.referralCode.trim() === '') {
        console.warn(`âš ï¸ [googleLogin] Utilisateur ${user.id} sans referralCode, gÃ©nÃ©ration...`);

        const newCode = await this.generateReferralCode(user.id);

        if (!newCode || newCode.trim() === '') {
          throw new InternalServerErrorException(
            await this.i18n.translate('user.referral_code_generation_failed', lang),
          );
        }

        user.referralCode = newCode;
        await this.usersRepository.save(user);
        console.log(`âœ… [googleLogin] referralCode gÃ©nÃ©rÃ©: ${newCode}`);
      }

      // ============================================================
      // ðŸ”¥ GARANTIR LE COMPTE FIDÃ‰LITÃ‰
      // âœ… OPTIMISATION : assigner directement sans recharger
      // ============================================================
      if (!user.loyalty || user.loyalty.length === 0) {
        console.log(`âš ï¸ [googleLogin] Utilisateur ${user.id} sans loyalty, crÃ©ation...`);
        const loyalty = await this.getOrCreateLoyaltyAccount(user.id);
        await this.loyaltyRepository.save(loyalty);
        user.loyalty = [loyalty];
      }

    } else {
      // ============================================================
      // ðŸ”¥ NOUVEL UTILISATEUR
      // ============================================================
      const newUser = this.usersRepository.create({
        email,
        fullName,
        role: UserRole.CUSTOMER,
        provider: dto.provider || 'google',
        password: '',
        isActive: true,
        image: image || undefined,
        phone: '',
      });
      user = await this.usersRepository.save(newUser);
      isNewUser = true;

      // âœ… GÃ©nÃ©ration du code de parrainage
      const referralCodeGenerated = await this.generateReferralCode(user.id);

      if (!referralCodeGenerated || referralCodeGenerated.trim() === '') {
        throw new InternalServerErrorException(
          await this.i18n.translate('user.referral_code_generation_failed', lang),
        );
      }

      user.referralCode = referralCodeGenerated;
      await this.usersRepository.save(user);
      console.log(`âœ… [googleLogin] Nouveau user crÃ©Ã© avec referralCode: ${referralCodeGenerated}`);

      // âœ… CrÃ©ation du compte fidÃ©litÃ©
      const loyalty = await this.getOrCreateLoyaltyAccount(user.id);
      await this.loyaltyRepository.save(loyalty);
      user.loyalty = [loyalty];

      // âœ… Envoi email de bienvenue EN ARRIÃˆRE-PLAN (non bloquant)
      (async () => {
        try {
          await this.mailService.sendHtmlEmail(
            email,
            await this.i18n.translate('user.welcome_subject', lang),
            'createCount.html',
            { userWithoutPassword: user, year: new Date().getFullYear() },
          );
        } catch (err: any) {
          console.error('âŒ [googleLogin] Welcome email error:', err.message);
        }
      })();

      // âœ… Recharger l'utilisateur complet
      user = await this.usersRepository
        .createQueryBuilder('users')
        .addSelect('users.password')
        .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
        .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
        .leftJoinAndSelect('userHasCompany.company', 'company')
        .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
        .leftJoinAndSelect('company.country', 'country')
        .leftJoinAndSelect('company.city', 'city')
        .leftJoinAndSelect('company.category', 'category')
        .leftJoinAndSelect('company.companyResources', 'companyResources')
        .leftJoinAndSelect('companyResources.resource', 'resource')
        .leftJoinAndSelect('company.branches', 'branches')
        .leftJoinAndSelect('company.settings', 'companySettings')
        .leftJoinAndSelect('company.invoiceConfiguration', 'invoiceConfiguration')
        .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
        .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
        .leftJoinAndSelect('userPlatformRoles.role', 'role')
        .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
        .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
        .leftJoinAndSelect(
          'userCompanyResources.resource',
          'userCompanyResourceDetail',
        )
        .leftJoinAndSelect('users.activeBranch', 'activeBranch')
        .leftJoinAndSelect('activeBranch.country', 'activeBranchCountry')
        .leftJoinAndSelect('activeBranch.city', 'activeBranchCity')
        .leftJoinAndSelect('users.loyalty', 'loyalty')
        .leftJoinAndSelect('users.referrals', 'referrals')
        .leftJoinAndSelect('users.referrer', 'referrer')
        .where('users.id = :id', { id: user.id })
        .getOne();
    }

    if (!user)
      throw new InternalServerErrorException(
        await this.i18n.translate('user.user_not_found', lang),
      );

    // âœ… DÃ©finir automatiquement la premiÃ¨re compagnie comme active
    if (
      !user.activeCompanyId &&
      user.userHasCompany &&
      user.userHasCompany.length > 0
    ) {
      const firstCompany = user.userHasCompany[0].company;
      if (firstCompany) {
        user.activeCompanyId = firstCompany.id;
        if (firstCompany.branches?.length > 0 && !user.activeBranchId) {
          user.activeBranchId = firstCompany.branches[0].id;
        }
        await this.usersRepository.save(user);
        // âœ… OPTIMISATION : assigner directement (l'entitÃ© user a dÃ©jÃ  tout)
      }
    }

    // âœ… FCM token en arriÃ¨re-plan (non bloquant)
    if (fcmToken && platform) {
      (async () => {
        try {
          const existingToken = await this.deviceTokenRepo.findOne({
            where: { token: fcmToken },
            select: ['id'],
          });

          if (existingToken) {
            await this.deviceTokenRepo.update(
              { token: fcmToken },
              { userId: user!.id, platform, updatedAt: new Date() },
            );
          } else {
            await this.deviceTokenRepo.save(
              this.deviceTokenRepo.create({
                token: fcmToken,
                userId: user!.id,
                platform,
              }),
            );
          }
        } catch (err: any) {
          console.error('âŒ [googleLogin] FCM token save error:', err.message);
        }
      })();
    }

    // âœ… JWT en parallÃ¨le
    const [access_token, refresh_token] = await Promise.all([
      this.accessToken(user),
      this.refreshToken(user),
    ]);

    const { password, ...userWithoutPassword } = user;

    // ============================================================
    // âœ… OPTIMISATION : userHasCompany (avec settings + invoiceConfiguration)
    // ============================================================
    const userHasCompany =
      userWithoutPassword.userHasCompany?.map((uhc) => ({
        id: uhc.id,
        isOwner: uhc.isOwner,
        company: uhc.company
          ? {
            ...uhc.company,
            tauxCompanies: uhc.company.tauxCompanies ?? [],
            country: uhc.company.country ?? null,
            city: uhc.company.city ?? null,
            category: uhc.company.category ?? null,
            settings: (uhc.company as any).settings ?? null,
            invoiceConfiguration:
              (uhc.company as any).invoiceConfiguration ?? null,
            branches: (uhc.company.branches ?? []).map((b) => ({
              id: b.id,
              name: b.name,
              address: b.address,
              phone: b.phone,
              email: b.email,
              status: b.status,
              deleted: b.deleted,
              country: b.country
                ? { id: b.country.id, name: b.country.name }
                : null,
              city: b.city ? { id: b.city.id, name: b.city.name } : null,
            })),
          }
          : null,
        branch: uhc.branch
          ? { id: uhc.branch.id, name: uhc.branch.name }
          : null,
        userResources:
          uhc.resources?.map((r) => ({
            id: r.id,
            canCreate: r.canCreate,
            canRead: r.canRead,
            canUpdate: r.canUpdate,
            canDelete: r.canDelete,
            canManage: r.canManage,
            status: r.status,
            resource: r.resource
              ? {
                id: r.resource.id,
                name: r.resource.name,
                label: r.resource.label,
              }
              : null,
          })) ?? [],
      })) ?? [];

    // ============================================================
    // âœ… OPTIMISATION : activeCompany calculÃ©e depuis user.userHasCompany
    //    (plus de requÃªte activeCompanyRaw)
    // ============================================================
    const activeUserHasCompany = user.userHasCompany?.find(
      (uhc) => uhc.company?.id === user.activeCompanyId,
    );
    const activeCompanyEntity = activeUserHasCompany?.company ?? null;

    const userResourcesForActiveCompany =
      activeUserHasCompany?.resources?.map((r) => ({
        id: r.id,
        canCreate: r.canCreate,
        canRead: r.canRead,
        canUpdate: r.canUpdate,
        canDelete: r.canDelete,
        canManage: r.canManage,
        status: r.status,
        resource: r.resource
          ? {
            id: r.resource.id,
            name: r.resource.name,
            label: r.resource.label,
          }
          : null,
      })) ?? [];

    const activeCompanyBranch = activeUserHasCompany?.branch
      ? {
        id: activeUserHasCompany.branch.id,
        name: activeUserHasCompany.branch.name,
      }
      : null;

    const activeCompany = activeCompanyEntity
      ? {
        ...activeCompanyEntity,
        tauxCompanies: activeCompanyEntity.tauxCompanies ?? [],
        country: activeCompanyEntity.country ?? null,
        city: activeCompanyEntity.city ?? null,
        category: activeCompanyEntity.category ?? null,
        settings: (activeCompanyEntity as any).settings ?? null,
        invoiceConfiguration:
          (activeCompanyEntity as any).invoiceConfiguration ?? null,
        branch: activeCompanyBranch,
        companyResources:
          activeCompanyEntity.companyResources?.map((cr) => ({
            id: cr.id,
            canCreate: cr.can_create,
            canRead: cr.can_read,
            canUpdate: cr.can_update,
            canDelete: cr.can_delete,
            canManage: cr.can_manage,
            status: cr.status,
            resource: cr.resource
              ? {
                id: cr.resource.id,
                name: cr.resource.name,
                label: cr.resource.label,
              }
              : null,
          })) ?? [],
        userResources: userResourcesForActiveCompany,
        branches: (activeCompanyEntity.branches ?? []).map((b) => ({
          id: b.id,
          name: b.name,
          address: b.address,
          phone: b.phone,
          email: b.email,
          status: b.status,
          deleted: b.deleted,
          country: b.country
            ? { id: b.country.id, name: b.country.name }
            : null,
          city: b.city ? { id: b.city.id, name: b.city.name } : null,
        })),
      }
      : null;

    const userPlatformRoles =
      userWithoutPassword.userPlatformRoles?.map((upr: any) => ({
        id: upr.id,
        platform: upr.platform,
        role: upr.role,
      })) ?? [];

    const activeBranch = userWithoutPassword.activeBranch
      ? {
        id: userWithoutPassword.activeBranch.id,
        name: userWithoutPassword.activeBranch.name,
        address: userWithoutPassword.activeBranch.address,
        phone: userWithoutPassword.activeBranch.phone,
        email: userWithoutPassword.activeBranch.email,
        status: userWithoutPassword.activeBranch.status,
        deleted: userWithoutPassword.activeBranch.deleted,
        country: userWithoutPassword.activeBranch.country
          ? {
            id: userWithoutPassword.activeBranch.country.id,
            name: userWithoutPassword.activeBranch.country.name,
          }
          : null,
        city: userWithoutPassword.activeBranch.city
          ? {
            id: userWithoutPassword.activeBranch.city.id,
            name: userWithoutPassword.activeBranch.city.name,
          }
          : null,
      }
      : null;

    const referralData = {
      referralCode: user.referralCode,
      referralCount: user.referralCount || 0,
      referralPoints: user.referralPoints || 0,
      referredBy: user.referredBy,
      referrerName: user.referrer?.fullName || null,
      referralActive: user.referralActive !== false,
      totalReferrals: user.referrals?.length || 0,
    };

    return {
      message: isNewUser
        ? await this.i18n.translate('user.google_account_created', lang)
        : await this.i18n.translate('user.google_login_success', lang),
      data: instanceToPlain({
        ...userWithoutPassword,
        userHasCompany,
        activeCompany,
        userPlatformRoles,
        activeBranch,
        loyalty: {
          points: user.loyalty?.[0]?.pointsBalance ?? 0,
          tier: user.loyalty?.[0]?.currentTier ?? null,
          code: user.loyalty?.[0]?.loyaltyCode ?? null,
        },
        referral: referralData,
      }),
      access_token,
      refresh_token,
      fcmToken,
    };
  }

  async appleLogin(
    dto: {
      appleUserId: string;
      fullName?: string;
      email?: string;
      fcmToken?: string;
      platform?: 'ios' | 'android' | 'web';
    },
    lang: string = 'fr',
  ): Promise<{
    message: string;
    data: any;
    access_token: string;
    refresh_token: string;
    fcmToken?: string;
  }> {
    const {
      appleUserId,
      fullName: rawFullName,
      email: rawEmail,
      fcmToken,
      platform,
    } = dto;
    if (!appleUserId)
      throw new BadRequestException(
        await this.i18n.translate('user.apple_user_id_required', lang),
      );
    const fullName = rawFullName?.trim() || 'Utilisateur Apple';
    const email = rawEmail?.trim() || undefined;

    let user = await this.usersRepository
      .createQueryBuilder('users')
      .addSelect('users.password')
      .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('company.companyResources', 'companyResources')
      .leftJoinAndSelect('companyResources.resource', 'resource')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('company.settings', 'companySettings')
      .leftJoinAndSelect('company.invoiceConfiguration', 'invoiceConfiguration')
      .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
      .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
      .leftJoinAndSelect('userPlatformRoles.role', 'role')
      .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .leftJoinAndSelect('users.activeBranch', 'activeBranch')
      .leftJoinAndSelect('activeBranch.country', 'activeBranchCountry')
      .leftJoinAndSelect('activeBranch.city', 'activeBranchCity')
      .leftJoinAndSelect('users.loyalty', 'loyalty')
      .leftJoinAndSelect('users.referrals', 'referrals')
      .leftJoinAndSelect('users.referrer', 'referrer')
      .where('users.appleUserId = :appleUserId', { appleUserId })
      .getOne();

    let isNewUser = false;

    // âœ… VÃ©rification email unique (si pas d'user trouvÃ© par appleUserId)
    if (!user && email) {
      const existingUserByEmail = await this.usersRepository.findOne({
        where: { email },
        select: ['id'],
      });
      if (existingUserByEmail) {
        throw new BadRequestException(
          await this.i18n.translate('user.email_already_exists', lang),
        );
      }
    }

    if (!user) {
      // ============================================================
      // ðŸ”¥ NOUVEL UTILISATEUR
      // ============================================================
      const newUser = this.usersRepository.create({
        appleUserId,
        fullName,
        email,
        provider: 'APPLE',
        role: UserRole.CUSTOMER,
        password: '',
        isActive: true,
      });
      user = await this.usersRepository.save(newUser);
      isNewUser = true;

      console.log(`ðŸ” [appleLogin] Nouvel utilisateur: ${user.id}, gÃ©nÃ©ration du referralCode...`);

      // âœ… OPTIMISATION : utilise la mÃ©thode existante directement
      const referralCodeGenerated = await this.generateReferralCode(user.id);

      if (!referralCodeGenerated || referralCodeGenerated.trim() === '') {
        throw new InternalServerErrorException(
          await this.i18n.translate('user.referral_code_generation_failed', lang),
        );
      }

      user.referralCode = referralCodeGenerated;
      await this.usersRepository.save(user);
      console.log(`âœ… [appleLogin] Nouveau user crÃ©Ã© avec referralCode: ${referralCodeGenerated}`);

      // âœ… CrÃ©ation du compte fidÃ©litÃ© + assignation directe
      const loyalty = await this.getOrCreateLoyaltyAccount(user.id);
      await this.loyaltyRepository.save(loyalty);
      user.loyalty = [loyalty];

      // âœ… OPTIMISATION : welcome email EN ARRIÃˆRE-PLAN (non bloquant)
      if (user.email) {
        const userEmail = user.email;
        const userSnapshot = { ...user };
        (async () => {
          try {
            await this.mailService.sendHtmlEmail(
              userEmail,
              await this.i18n.translate('user.welcome_subject', lang),
              'createCount.html',
              { userWithoutPassword: userSnapshot, year: new Date().getFullYear() },
            );
          } catch (err: any) {
            console.error('âŒ [appleLogin] Welcome email error:', err.message);
          }
        })();
      }

      // âœ… Recharger l'utilisateur COMPLET (nÃ©cessaire pour le retour)
      user = await this.usersRepository
        .createQueryBuilder('users')
        .addSelect('users.password')
        .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
        .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
        .leftJoinAndSelect('userHasCompany.company', 'company')
        .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
        .leftJoinAndSelect('company.country', 'country')
        .leftJoinAndSelect('company.city', 'city')
        .leftJoinAndSelect('company.category', 'category')
        .leftJoinAndSelect('company.companyResources', 'companyResources')
        .leftJoinAndSelect('companyResources.resource', 'resource')
        .leftJoinAndSelect('company.branches', 'branches')
        .leftJoinAndSelect('company.settings', 'companySettings')
        .leftJoinAndSelect('company.invoiceConfiguration', 'invoiceConfiguration')
        .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
        .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
        .leftJoinAndSelect('userPlatformRoles.role', 'role')
        .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
        .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
        .leftJoinAndSelect(
          'userCompanyResources.resource',
          'userCompanyResourceDetail',
        )
        .leftJoinAndSelect('users.activeBranch', 'activeBranch')
        .leftJoinAndSelect('activeBranch.country', 'activeBranchCountry')
        .leftJoinAndSelect('activeBranch.city', 'activeBranchCity')
        .leftJoinAndSelect('users.loyalty', 'loyalty')
        .leftJoinAndSelect('users.referrals', 'referrals')
        .leftJoinAndSelect('users.referrer', 'referrer')
        .where('users.id = :id', { id: user.id })
        .getOne();
    } else {
      // ============================================================
      // ðŸ”¥ UTILISATEUR EXISTANT
      // ============================================================
      console.log(`ðŸ” [appleLogin] Utilisateur existant: ${user.id}`);

      if (user.provider !== 'APPLE') {
        throw new BadRequestException(
          await this.i18n.translate('user.apple_account_not_linked', lang, {
            provider: user.provider,
          }),
        );
      }

      let shouldUpdate = false;

      // Mise Ã  jour du nom
      if (fullName && fullName !== user.fullName) {
        user.fullName = fullName;
        shouldUpdate = true;
      }

      // Mise Ã  jour de l'email (avec vÃ©rif unicitÃ©)
      if (email && email !== user.email) {
        const existingUserByEmail = await this.usersRepository.findOne({
          where: { email },
          select: ['id'],
        });
        if (existingUserByEmail && existingUserByEmail.id !== user.id) {
          throw new BadRequestException(
            await this.i18n.translate('user.email_already_exists', lang),
          );
        }
        user.email = email;
        shouldUpdate = true;
      }

      // ============================================================
      // ðŸ”¥ GARANTIR LE referralCode
      // âœ… OPTIMISATION : utilise generateReferralCode directement
      // ============================================================
      if (!user.referralCode || user.referralCode.trim() === '') {
        console.warn(`âš ï¸ [appleLogin] Utilisateur ${user.id} sans referralCode, gÃ©nÃ©ration...`);

        const newCode = await this.generateReferralCode(user.id);

        if (!newCode || newCode.trim() === '') {
          throw new InternalServerErrorException(
            await this.i18n.translate('user.referral_code_generation_failed', lang),
          );
        }

        user.referralCode = newCode;
        shouldUpdate = true;
        console.log(`âœ… [appleLogin] referralCode gÃ©nÃ©rÃ©: ${newCode}`);
      }

      // ============================================================
      // ðŸ”¥ GARANTIR LE COMPTE FIDÃ‰LITÃ‰
      // âœ… OPTIMISATION : assignation directe (pas de rechargement)
      // ============================================================
      if (!user.loyalty || user.loyalty.length === 0) {
        console.log(`âš ï¸ [appleLogin] Utilisateur ${user.id} sans loyalty, crÃ©ation...`);
        const loyalty = await this.getOrCreateLoyaltyAccount(user.id);
        await this.loyaltyRepository.save(loyalty);
        user.loyalty = [loyalty];
      }

      // âœ… Save si modifiÃ©
      if (shouldUpdate) {
        await this.usersRepository.save(user);
      }
    }

    if (!user)
      throw new InternalServerErrorException(
        await this.i18n.translate('user.user_not_found', lang),
      );

    // ============================================================
    // âœ… FCM token en ARRIÃˆRE-PLAN (non bloquant)
    // ============================================================
    if (fcmToken && platform) {
      const userId = user.id;
      (async () => {
        try {
          const existingToken = await this.deviceTokenRepo.findOne({
            where: { token: fcmToken },
            select: ['id'],
          });

          if (existingToken) {
            await this.deviceTokenRepo.update(
              { token: fcmToken },
              { userId, platform, updatedAt: new Date() },
            );
          } else {
            await this.deviceTokenRepo.save(
              this.deviceTokenRepo.create({
                token: fcmToken,
                userId,
                platform,
              }),
            );
          }
        } catch (err: any) {
          console.error('âŒ [appleLogin] FCM token save error:', err.message);
        }
      })();
    }

    // ============================================================
    // âœ… JWT en PARALLÃˆLE
    // ============================================================
    const [access_token, refresh_token] = await Promise.all([
      this.accessToken(user),
      this.refreshToken(user),
    ]);

    const { password, ...userWithoutPassword } = user;

    // ============================================================
    // âœ… userHasCompany (avec settings + invoiceConfiguration)
    // ============================================================
    const userHasCompany =
      userWithoutPassword.userHasCompany?.map((uhc) => ({
        id: uhc.id,
        isOwner: uhc.isOwner,
        company: uhc.company
          ? {
            ...uhc.company,
            tauxCompanies: uhc.company.tauxCompanies ?? [],
            country: uhc.company.country ?? null,
            city: uhc.company.city ?? null,
            category: uhc.company.category ?? null,
            settings: (uhc.company as any).settings ?? null,
            invoiceConfiguration:
              (uhc.company as any).invoiceConfiguration ?? null,
            branches: (uhc.company.branches ?? []).map((b) => ({
              id: b.id,
              name: b.name,
              address: b.address,
              phone: b.phone,
              email: b.email,
              status: b.status,
              deleted: b.deleted,
              country: b.country
                ? { id: b.country.id, name: b.country.name }
                : null,
              city: b.city ? { id: b.city.id, name: b.city.name } : null,
            })),
          }
          : null,
        branch: uhc.branch
          ? { id: uhc.branch.id, name: uhc.branch.name }
          : null,
        userResources:
          uhc.resources?.map((r) => ({
            id: r.id,
            canCreate: r.canCreate,
            canRead: r.canRead,
            canUpdate: r.canUpdate,
            canDelete: r.canDelete,
            canManage: r.canManage,
            status: r.status,
            resource: r.resource
              ? {
                id: r.resource.id,
                name: r.resource.name,
                label: r.resource.label,
              }
              : null,
          })) ?? [],
      })) ?? [];

    // ============================================================
    // âœ… OPTIMISATION : activeCompany calculÃ©e depuis user.userHasCompany
    //    (plus de requÃªte activeCompanyRaw)
    // ============================================================
    const activeUserHasCompany = user.userHasCompany?.find(
      (uhc) => uhc.company?.id === user.activeCompanyId,
    );
    const activeCompanyEntity = activeUserHasCompany?.company ?? null;

    const userResourcesForActiveCompany =
      activeUserHasCompany?.resources?.map((r) => ({
        id: r.id,
        canCreate: r.canCreate,
        canRead: r.canRead,
        canUpdate: r.canUpdate,
        canDelete: r.canDelete,
        canManage: r.canManage,
        status: r.status,
        resource: r.resource
          ? {
            id: r.resource.id,
            name: r.resource.name,
            label: r.resource.label,
          }
          : null,
      })) ?? [];

    const activeCompanyBranch = activeUserHasCompany?.branch
      ? {
        id: activeUserHasCompany.branch.id,
        name: activeUserHasCompany.branch.name,
      }
      : null;

    const activeCompany = activeCompanyEntity
      ? {
        ...activeCompanyEntity,
        tauxCompanies: activeCompanyEntity.tauxCompanies ?? [],
        country: activeCompanyEntity.country ?? null,
        city: activeCompanyEntity.city ?? null,
        category: activeCompanyEntity.category ?? null,
        settings: (activeCompanyEntity as any).settings ?? null,
        invoiceConfiguration:
          (activeCompanyEntity as any).invoiceConfiguration ?? null,
        branch: activeCompanyBranch,
        companyResources:
          activeCompanyEntity.companyResources?.map((cr) => ({
            id: cr.id,
            canCreate: cr.can_create,
            canRead: cr.can_read,
            canUpdate: cr.can_update,
            canDelete: cr.can_delete,
            canManage: cr.can_manage,
            status: cr.status,
            resource: cr.resource
              ? {
                id: cr.resource.id,
                name: cr.resource.name,
                label: cr.resource.label,
              }
              : null,
          })) ?? [],
        userResources: userResourcesForActiveCompany,
        branches: (activeCompanyEntity.branches ?? []).map((b) => ({
          id: b.id,
          name: b.name,
          address: b.address,
          phone: b.phone,
          email: b.email,
          status: b.status,
          deleted: b.deleted,
          country: b.country
            ? { id: b.country.id, name: b.country.name }
            : null,
          city: b.city ? { id: b.city.id, name: b.city.name } : null,
        })),
      }
      : null;

    const userPlatformRoles =
      userWithoutPassword.userPlatformRoles?.map((upr: any) => ({
        id: upr.id,
        platform: upr.platform,
        role: upr.role,
      })) ?? [];

    const activeBranch = userWithoutPassword.activeBranch
      ? {
        id: userWithoutPassword.activeBranch.id,
        name: userWithoutPassword.activeBranch.name,
        address: userWithoutPassword.activeBranch.address,
        phone: userWithoutPassword.activeBranch.phone,
        email: userWithoutPassword.activeBranch.email,
        status: userWithoutPassword.activeBranch.status,
        deleted: userWithoutPassword.activeBranch.deleted,
        country: userWithoutPassword.activeBranch.country
          ? {
            id: userWithoutPassword.activeBranch.country.id,
            name: userWithoutPassword.activeBranch.country.name,
          }
          : null,
        city: userWithoutPassword.activeBranch.city
          ? {
            id: userWithoutPassword.activeBranch.city.id,
            name: userWithoutPassword.activeBranch.city.name,
          }
          : null,
      }
      : null;

    const referralData = {
      referralCode: user.referralCode,
      referralCount: user.referralCount || 0,
      referralPoints: user.referralPoints || 0,
      referredBy: user.referredBy,
      referrerName: user.referrer?.fullName || null,
      referralActive: user.referralActive !== false,
      totalReferrals: user.referrals?.length || 0,
    };

    return {
      message: isNewUser
        ? await this.i18n.translate('user.apple_account_created', lang)
        : await this.i18n.translate('user.apple_login_success', lang),
      data: instanceToPlain({
        ...userWithoutPassword,
        userHasCompany,
        activeCompany,
        userPlatformRoles,
        activeBranch,
        loyalty: {
          points: user.loyalty?.[0]?.pointsBalance ?? 0,
          tier: user.loyalty?.[0]?.currentTier ?? null,
          code: user.loyalty?.[0]?.loyaltyCode ?? null,
        },
        referral: referralData,
      }),
      access_token,
      refresh_token,
      fcmToken,
    };
  }

  // ==================== APPLE LOGIN ====================
  private async ensureReferralCodeAndLoyalty(
    user: UserEntity,
    lang: string,
  ): Promise<UserEntity> {
    let needsSave = false;

    // ðŸ”¥ Garantir le referralCode
    if (!user.referralCode || user.referralCode.trim() === '') {
      console.warn(`âš ï¸ Utilisateur ${user.id} sans referralCode, gÃ©nÃ©ration...`);

      const existingCodesRows = await this.usersRepository
        .createQueryBuilder('u')
        .select('u.referralCode', 'code')
        .where('u.referralCode IS NOT NULL')
        .andWhere("TRIM(u.referralCode) != ''")
        .getRawMany();
      const existingCodes = existingCodesRows.map((r) => r.code);

      const newCode = await this.generateReferralCode(user.id, existingCodes);
      if (!newCode || newCode.trim() === '') {
        throw new InternalServerErrorException(
          await this.i18n.translate('user.referral_code_generation_failed', lang),
        );
      }
      user.referralCode = newCode;
      needsSave = true;
      console.log(`âœ… referralCode gÃ©nÃ©rÃ©: ${newCode}`);
    }

    // ðŸ”¥ Garantir le compte fidÃ©litÃ©
    if (!user.loyalty || user.loyalty.length === 0) {
      console.log(`âš ï¸ Utilisateur ${user.id} sans loyalty, crÃ©ation...`);
      const loyalty = await this.getOrCreateLoyaltyAccount(user.id);
      await this.loyaltyRepository.save(loyalty);
    }

    if (needsSave) {
      await this.usersRepository.save(user);
    }

    return user;
  }

  // ==================== UPDATE USER ====================
  async update(
    updateUserDto: Partial<UpdateUserDto>,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{
    message: string;
    data: any;
    access_token: string;
    refresh_token: string;
  }> {
    try {
      const user = await this.usersRepository.findOne({
        where: { id: currentUser.id },
      });
      if (!user)
        throw new NotFoundException(
          await this.i18n.translate('user.user_not_found', lang),
        );

      const {
        provider,
        appleUserId,
        role,
        password,
        isActive,
        email,
        deleted,
        ...safeUpdateData
      } = updateUserDto as any;
      Object.assign(user, safeUpdateData);
      await this.usersRepository.save(user);

      let fullUser = await this.usersRepository
        .createQueryBuilder('users')
        .addSelect('users.password')
        .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
        .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
        .leftJoinAndSelect('userHasCompany.company', 'company')
        .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
        .leftJoinAndSelect('company.country', 'country')
        .leftJoinAndSelect('company.city', 'city')
        .leftJoinAndSelect('company.category', 'category')
        .leftJoinAndSelect('company.companyResources', 'companyResources')
        .leftJoinAndSelect('companyResources.resource', 'resource')
        .leftJoinAndSelect('company.branches', 'branches')
        .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
        .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
        .leftJoinAndSelect('userPlatformRoles.role', 'role')
        .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
        .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
        .leftJoinAndSelect(
          'userCompanyResources.resource',
          'userCompanyResourceDetail',
        )
        .leftJoinAndSelect('users.activeBranch', 'activeBranch')
        .leftJoinAndSelect('activeBranch.country', 'activeBranchCountry')
        .leftJoinAndSelect('activeBranch.city', 'activeBranchCity')
        .where('users.id = :id', { id: user.id })
        .getOne();

      if (!fullUser)
        throw new NotFoundException(
          await this.i18n.translate('user.user_not_found', lang),
        );

      // âœ… OPTIMISATION : JWT en parallÃ¨le
      const [access_token, refresh_token] = await Promise.all([
        this.accessToken(fullUser),
        this.refreshToken(fullUser),
      ]);

      const { password: _, ...userWithoutPassword } = fullUser;

      const userHasCompany =
        userWithoutPassword.userHasCompany?.map((uhc) => ({
          id: uhc.id,
          isOwner: uhc.isOwner,
          company: uhc.company
            ? {
              ...uhc.company,
              tauxCompanies: uhc.company.tauxCompanies ?? [],
              country: uhc.company.country ?? null,
              city: uhc.company.city ?? null,
              category: uhc.company.category ?? null,
              branches: (uhc.company.branches ?? []).map((b) => ({
                id: b.id,
                name: b.name,
                address: b.address,
                phone: b.phone,
                email: b.email,
                status: b.status,
                deleted: b.deleted,
                country: b.country
                  ? { id: b.country.id, name: b.country.name }
                  : null,
                city: b.city ? { id: b.city.id, name: b.city.name } : null,
              })),
            }
            : null,
          branch: uhc.branch
            ? { id: uhc.branch.id, name: uhc.branch.name }
            : null,
          userResources:
            uhc.resources?.map((r) => ({
              id: r.id,
              canCreate: r.canCreate,
              canRead: r.canRead,
              canUpdate: r.canUpdate,
              canDelete: r.canDelete,
              canManage: r.canManage,
              status: r.status,
              resource: r.resource
                ? {
                  id: r.resource.id,
                  name: r.resource.name,
                  label: r.resource.label,
                }
                : null,
            })) ?? [],
        })) ?? [];

      // âœ… OPTIMISATION : activeCompany calculÃ©e depuis fullUser.userHasCompany
      //    (plus de requÃªte activeCompanyRaw)
      const activeUserHasCompany = fullUser.userHasCompany?.find(
        (uhc) => uhc.company?.id === fullUser.activeCompanyId,
      );
      const activeCompanyEntity = activeUserHasCompany?.company ?? null;
      const userResourcesForActiveCompany =
        activeUserHasCompany?.resources?.map((r) => ({
          id: r.id,
          canCreate: r.canCreate,
          canRead: r.canRead,
          canUpdate: r.canUpdate,
          canDelete: r.canDelete,
          canManage: r.canManage,
          status: r.status,
          resource: r.resource
            ? {
              id: r.resource.id,
              name: r.resource.name,
              label: r.resource.label,
            }
            : null,
        })) ?? [];

      const activeCompanyBranch = activeUserHasCompany?.branch
        ? {
          id: activeUserHasCompany.branch.id,
          name: activeUserHasCompany.branch.name,
        }
        : null;

      const activeCompany = activeCompanyEntity
        ? {
          ...activeCompanyEntity,
          tauxCompanies: activeCompanyEntity.tauxCompanies ?? [],
          country: activeCompanyEntity.country ?? null,
          city: activeCompanyEntity.city ?? null,
          category: activeCompanyEntity.category ?? null,
          branch: activeCompanyBranch,
          companyResources:
            activeCompanyEntity.companyResources?.map((cr) => ({
              id: cr.id,
              canCreate: cr.can_create,
              canRead: cr.can_read,
              canUpdate: cr.can_update,
              canDelete: cr.can_delete,
              canManage: cr.can_manage,
              status: cr.status,
              resource: cr.resource
                ? {
                  id: cr.resource.id,
                  name: cr.resource.name,
                  label: cr.resource.label,
                }
                : null,
            })) ?? [],
          userResources: userResourcesForActiveCompany,
          branches: (activeCompanyEntity.branches ?? []).map((b) => ({
            id: b.id,
            name: b.name,
            address: b.address,
            phone: b.phone,
            email: b.email,
            status: b.status,
            deleted: b.deleted,
            country: b.country
              ? { id: b.country.id, name: b.country.name }
              : null,
            city: b.city ? { id: b.city.id, name: b.city.name } : null,
          })),
        }
        : null;

      const userPlatformRoles =
        userWithoutPassword.userPlatformRoles?.map((upr: any) => ({
          id: upr.id,
          platform: upr.platform,
          role: upr.role,
        })) ?? [];

      const activeBranch = userWithoutPassword.activeBranch
        ? {
          id: userWithoutPassword.activeBranch.id,
          name: userWithoutPassword.activeBranch.name,
          address: userWithoutPassword.activeBranch.address,
          phone: userWithoutPassword.activeBranch.phone,
          email: userWithoutPassword.activeBranch.email,
          status: userWithoutPassword.activeBranch.status,
          deleted: userWithoutPassword.activeBranch.deleted,
          country: userWithoutPassword.activeBranch.country
            ? {
              id: userWithoutPassword.activeBranch.country.id,
              name: userWithoutPassword.activeBranch.country.name,
            }
            : null,
          city: userWithoutPassword.activeBranch.city
            ? {
              id: userWithoutPassword.activeBranch.city.id,
              name: userWithoutPassword.activeBranch.city.name,
            }
            : null,
        }
        : null;

      return {
        message: await this.i18n.translate('user.user_updated', lang),
        data: instanceToPlain({
          ...userWithoutPassword,
          userHasCompany,
          activeCompany,
          userPlatformRoles,
          activeBranch,
        }),
        access_token,
        refresh_token,
      };
    } catch (error) {
      console.error('Erreur lors de la mise Ã  jour de lâ€™utilisateur:', error);
      throw new InternalServerErrorException(
        await this.i18n.translate('user.user_updated_failed', lang),
      );
    }
  }

  async updateProfileImage(
    userId: string,
    file?: Express.Multer.File,
    lang: string = 'fr',
  ): Promise<{
    message: string;
    data: any;
  }> {
    let user = await this.usersRepository
      .createQueryBuilder('users')
      .addSelect('users.password')
      .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('company.companyResources', 'companyResources')
      .leftJoinAndSelect('companyResources.resource', 'resource')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
      .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
      .leftJoinAndSelect('userPlatformRoles.role', 'role')
      .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .leftJoinAndSelect('users.activeBranch', 'activeBranch')
      .leftJoinAndSelect('activeBranch.country', 'activeBranchCountry')
      .leftJoinAndSelect('activeBranch.city', 'activeBranchCity')
      .where('users.id = :id', { id: userId })
      .getOne();

    if (!user)
      throw new NotFoundException(
        await this.i18n.translate('user.user_not_found', lang),
      );
    if (!file)
      throw new BadRequestException(
        await this.i18n.translate('user.invalid_image', lang),
      );

    if (user.image && user.image.includes('/uploads/')) {
      try {
        const filename = user.image.split('/').pop()!;
        await this.filesService.deleteFile('user', filename);
      } catch (err) {
        console.warn('âš ï¸ Ã‰chec suppression ancienne image :', err.message);
      }
    }

    const uploadedFile = await this.filesService.uploadFile(
      file,
      'user',
      'avatar',
    );
    user.image = uploadedFile.data;
    const updatedUser = await this.usersRepository.save(user);

    // ============================================================
    // âœ… OPTIMISATION : on utilise directement `user` (dÃ©jÃ  chargÃ© avec toutes
    //    les relations) au lieu de recharger `fullUser`
    // ============================================================

    const { password, ...userWithoutPassword } = user;

    const userHasCompany = (userWithoutPassword.userHasCompany || []).map(
      (uhc) => ({
        id: uhc.id,
        isOwner: uhc.isOwner,
        company: uhc.company
          ? {
            ...uhc.company,
            tauxCompanies: uhc.company.tauxCompanies ?? [],
            country: uhc.company.country ?? null,
            city: uhc.company.city ?? null,
            category: uhc.company.category ?? null,
            branches: (uhc.company.branches || []).map((b) => ({
              id: b.id,
              name: b.name,
              address: b.address,
              phone: b.phone,
              email: b.email,
              status: b.status,
              deleted: b.deleted,
              country: b.country
                ? { id: b.country.id, name: b.country.name }
                : null,
              city: b.city ? { id: b.city.id, name: b.city.name } : null,
            })),
          }
          : null,
        branch: uhc.branch
          ? { id: uhc.branch.id, name: uhc.branch.name }
          : null,
        userResources: (uhc.resources || []).map((r) => ({
          id: r.id,
          canCreate: r.canCreate,
          canRead: r.canRead,
          canUpdate: r.canUpdate,
          canDelete: r.canDelete,
          canManage: r.canManage,
          status: r.status,
          resource: r.resource
            ? {
              id: r.resource.id,
              name: r.resource.name,
              label: r.resource.label,
            }
            : null,
        })),
      }),
    );

    // âœ… OPTIMISATION : activeCompany calculÃ©e depuis user.userHasCompany
    //    (plus de requÃªte activeCompanyRaw)
    const activeUserHasCompany = user.userHasCompany?.find(
      (uhc) => uhc.company?.id === user.activeCompanyId,
    );
    const activeCompanyEntity = activeUserHasCompany?.company ?? null;
    const activeCompanyBranch = activeUserHasCompany?.branch
      ? {
        id: activeUserHasCompany.branch.id,
        name: activeUserHasCompany.branch.name,
      }
      : null;

    const userResourcesForActiveCompany = (
      activeUserHasCompany?.resources || []
    ).map((r) => ({
      id: r.id,
      canCreate: r.canCreate,
      canRead: r.canRead,
      canUpdate: r.canUpdate,
      canDelete: r.canDelete,
      canManage: r.canManage,
      status: r.status,
      resource: r.resource
        ? { id: r.resource.id, name: r.resource.name, label: r.resource.label }
        : null,
    }));

    const activeCompany = activeCompanyEntity
      ? {
        ...activeCompanyEntity,
        tauxCompanies: activeCompanyEntity.tauxCompanies ?? [],
        country: activeCompanyEntity.country ?? null,
        city: activeCompanyEntity.city ?? null,
        category: activeCompanyEntity.category ?? null,
        branch: activeCompanyBranch,
        companyResources: (activeCompanyEntity.companyResources || []).map(
          (cr) => ({
            id: cr.id,
            canCreate: cr.can_create,
            canRead: cr.can_read,
            canUpdate: cr.can_update,
            canDelete: cr.can_delete,
            canManage: cr.can_manage,
            status: cr.status,
            resource: cr.resource
              ? {
                id: cr.resource.id,
                name: cr.resource.name,
                label: cr.resource.label,
              }
              : null,
          }),
        ),
        userResources: userResourcesForActiveCompany,
        branches: (activeCompanyEntity.branches || []).map((b) => ({
          id: b.id,
          name: b.name,
          address: b.address,
          phone: b.phone,
          email: b.email,
          status: b.status,
          deleted: b.deleted,
          country: b.country
            ? { id: b.country.id, name: b.country.name }
            : null,
          city: b.city ? { id: b.city.id, name: b.city.name } : null,
        })),
      }
      : null;

    const userPlatformRoles = (userWithoutPassword.userPlatformRoles || []).map(
      (upr: any) => ({
        id: upr.id,
        platform: upr.platform,
        role: upr.role,
      }),
    );

    const activeBranch = userWithoutPassword.activeBranch
      ? {
        id: userWithoutPassword.activeBranch.id,
        name: userWithoutPassword.activeBranch.name,
        address: userWithoutPassword.activeBranch.address,
        phone: userWithoutPassword.activeBranch.phone,
        email: userWithoutPassword.activeBranch.email,
        status: userWithoutPassword.activeBranch.status,
        deleted: userWithoutPassword.activeBranch.deleted,
        country: userWithoutPassword.activeBranch.country
          ? {
            id: userWithoutPassword.activeBranch.country.id,
            name: userWithoutPassword.activeBranch.country.name,
          }
          : null,
        city: userWithoutPassword.activeBranch.city
          ? {
            id: userWithoutPassword.activeBranch.city.id,
            name: userWithoutPassword.activeBranch.city.name,
          }
          : null,
      }
      : null;

    return {
      message: await this.i18n.translate('user.profile_image_updated', lang),
      data: instanceToPlain({
        ...userWithoutPassword,
        userHasCompany,
        activeCompany,
        userPlatformRoles,
        activeBranch,
      }),
    };
  }

  private extractPublicId(url: string): string | null {
    try {
      if (!url.includes('res.cloudinary.com')) return null;

      const uploadIndex = url.indexOf('/upload/');
      if (uploadIndex === -1) return null;

      let publicIdPart = url.substring(uploadIndex + '/upload/'.length);
      publicIdPart = publicIdPart.replace(/^v\d+\//, '');
      publicIdPart = publicIdPart.replace(/v\d+\//g, '');
      publicIdPart = publicIdPart.replace(/\.[^/.]+$/, '');

      return publicIdPart;
    } catch (error) {
      console.error('Erreur extraction public_id:', error);
      return null;
    }
  }

  async getReferralPoints(
    userId: string,
    lang: string = 'fr',
  ): Promise<any> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: [
        'referralHistory',
        'referralHistory.referred',
        'referralHistory.referred.orders',
      ],
    });

    if (!user) {
      throw new NotFoundException(
        await this.i18n.translate('user_not_found', lang)
      );
    }

    // ============================================================
    // âœ… RÃ‰CUPÃ‰RER LES TRANSACTIONS EN ATTENTE (DEPOSIT PENDING)
    // ============================================================
    let pendingTransactions = null;
    try {
      if (user.userIdFpay) {
        const pendingResult = await this.fpayService.getLastPendingTransaction(
          user.userIdFpay,
          'DEPOSIT'
        );

        if (pendingResult && pendingResult.success) {
          // âœ… Correction avec typage explicite
          const totalsArray = Object.entries(pendingResult.totalsByCurrency || {})
            .filter(([, amount]) => typeof amount === 'number' && amount > 0)
            .map(([currency, amount]) => ({
              amount: Math.round((amount as number) * 100) / 100,
              currency: currency,
            }));

          pendingTransactions = {
            ...pendingResult.data,
            totalsByCurrency: totalsArray,
            currencies: pendingResult.currencies || [],
            currenciesWithData: pendingResult.currenciesWithData || [],
            count: pendingResult.count || 0,
          };
        }
      }
    } catch (error) {
      console.error('[ReferralPoints] âŒ Erreur rÃ©cupÃ©ration transactions PENDING:', error.message);
    }

    let totalPoints = 0;
    const rewardsByCurrency: Record<string, number> = {};

    // âœ… Historique des parrainages
    const history = user.referralHistory?.map((referral) => {
      const referred = referral.referred;
      let orderDetails: any[] = [];
      let validatedOrdersLength = 0;

      const rewardAmount = Number(referral.rewardAmount) || 0;
      const rewardCurrency = referral.currency || 'USD';

      if (referred && referred.orders && referred.orders.length > 0) {
        const validatedOrders = referred.orders.filter(
          (order) => order.status === OrderStatus.VALIDATED
        );
        validatedOrdersLength = validatedOrders.length;

        orderDetails = validatedOrders.map((order) => ({
          orderId: order.id,
          shippingCost: order.shippingCost || 0,
          currency: order.currency || 'USD',
          reward: (Number(order.shippingCost || 0) * 0.10),
          rewardCurrency: rewardCurrency,
          createdAt: order.createdAt,
          status: order.status,
        }));
      }

      if (rewardAmount > 0) {
        if (!rewardsByCurrency[rewardCurrency]) {
          rewardsByCurrency[rewardCurrency] = 0;
        }
        rewardsByCurrency[rewardCurrency] += rewardAmount;
        totalPoints += rewardAmount;
      }

      return {
        id: referral.id,
        referredUser: referred?.fullName || 'Utilisateur inconnu',
        referredEmail: referred?.email || 'Non renseignÃ©',
        referredPhone: referred?.phone || 'Non renseignÃ©',
        referredId: referred?.id || null,
        status: referral.status,
        rewardAmount: Math.round(rewardAmount * 100) / 100,
        rewardCurrency: rewardCurrency,
        rewardType: 'POINTS (10% shipping - VALIDATED)',
        createdAt: referral.createdAt,
        completedAt: referral.completedAt || null,
        orders: orderDetails,
        totalValidatedOrders: validatedOrdersLength,
        referralCurrency: referral.currency || 'USD',
        metadata: referral.metadata,
      };
    }) || [];

    // âœ… Mise Ã  jour des points
    if (Math.round(totalPoints * 100) / 100 !== user.referralPoints) {
      user.referralPoints = Math.round(totalPoints * 100) / 100;
      await this.usersRepository.save(user);
    }

    // âœ… Liste des utilisateurs parrainÃ©s groupÃ©s
    const referredUsersMap = new Map<string, {
      id: string;
      fullName: string;
      email: string | null;
      phone: string | null;
      status: string;
      totalOrders: number;
      totalValidatedOrders: number;
      totalShippingCost: number;
      currency: string;
      pointsEarned: number;
      pointsCurrency: string;
      createdAt: Date;
      completedAt: Date | null;
    }>();

    for (const referral of user.referralHistory || []) {
      const referred = referral.referred;
      if (!referred) continue;

      const referredId = referred.id;
      const currency = referral.currency || 'USD';
      const pointsEarned = Number(referral.rewardAmount) || 0;

      const validatedOrders = referred.orders?.filter(
        (order) => order.status === OrderStatus.VALIDATED
      ) || [];
      const totalShippingCost = validatedOrders.reduce(
        (sum, order) => sum + Number(order.shippingCost || 0),
        0
      );

      if (!referredUsersMap.has(referredId)) {
        referredUsersMap.set(referredId, {
          id: referredId,
          fullName: referred.fullName || 'Utilisateur inconnu',
          email: referred.email || null,
          phone: referred.phone || null,
          status: referral.status,
          totalOrders: referred.orders?.length || 0,
          totalValidatedOrders: validatedOrders.length,
          totalShippingCost: 0,
          currency: currency,
          pointsEarned: 0,
          pointsCurrency: currency,
          createdAt: referral.createdAt,
          completedAt: referral.completedAt || null,
        });
      }

      const userEntry = referredUsersMap.get(referredId)!;
      userEntry.totalShippingCost += totalShippingCost;

      if (referral.createdAt > userEntry.createdAt) {
        userEntry.currency = currency;
        userEntry.pointsCurrency = currency;
        userEntry.pointsEarned = pointsEarned;
      } else if (referral.createdAt.getTime() === userEntry.createdAt.getTime()) {
        userEntry.pointsEarned += pointsEarned;
      }

      if (referral.completedAt && (!userEntry.completedAt || referral.completedAt > userEntry.completedAt)) {
        userEntry.completedAt = referral.completedAt;
      }
      if (referral.createdAt > userEntry.createdAt) {
        userEntry.createdAt = referral.createdAt;
      }
    }

    const referredUsers = Array.from(referredUsersMap.values()).map((entry) => ({
      id: entry.id,
      fullName: entry.fullName,
      email: entry.email,
      phone: entry.phone,
      status: entry.status,
      totalOrders: entry.totalOrders,
      totalValidatedOrders: entry.totalValidatedOrders,
      totalShippingCost: Math.round(entry.totalShippingCost * 100) / 100,
      currency: entry.currency,
      pointsEarned: Math.round(entry.pointsEarned * 100) / 100,
      pointsCurrency: entry.currency,
      createdAt: entry.createdAt,
      completedAt: entry.completedAt,
    }));

    referredUsers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const rewardsByCurrencyArray = Object.entries(rewardsByCurrency).map(([currency, amount]) => ({
      currency: currency,
      amount: Math.round(amount * 100) / 100,
    }));

    const baseUrl = 'https://favorhelp.com';
    const referralLink = user.referralCode
      ? `${baseUrl}/register?ref=${user.referralCode}`
      : null;

    return {
      message: await this.i18n.translate('referral_points_retrieved', lang),
      data: {
        referralPoints: Math.round(totalPoints * 100) / 100,
        totalReferralRewards: Math.round(totalPoints * 100) / 100,
        referralCount: user.referralCount || 0,
        referralCode: user.referralCode || 'Non gÃ©nÃ©rÃ©',
        referralLink: referralLink || 'Non disponible',
        referralActive: user.referralActive !== false,
        rewardsByCurrency: rewardsByCurrencyArray,
        defaultCurrency: 'USD',
        history,
        referredUsers,
        pendingTransactions: pendingTransactions,
      },
    };
  }

  async sendOtp(email: string, lang: string = 'fr'): Promise<any> {
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

    // Validation du DTO (optionnel selon votre logique)
    const dto = plainToInstance(VerifyOtpDto, { email, otpCode: '0000' });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const errorMessages = errors
        .map((err) => Object.values(err.constraints ?? {}).join(', '))
        .join(', ');
      throw new BadRequestException(errorMessages);
    }

    // Supprimer l'ancien OTP non utilisÃ©
    const existingOtp = await this.otpRepository.findOne({
      where: { email, isUsed: false },
    });
    if (existingOtp) await this.otpRepository.remove(existingOtp);

    // CrÃ©er le nouvel OTP
    const otp = this.otpRepository.create({
      email,
      otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await this.otpRepository.save(otp);

    // Envoi par email ou SMS
    if (validator.isEmail(email)) {
      // RÃ©cupÃ©ration des traductions pour l'email
      const translations = {
        title: await this.i18n.translate('user.otp_email_title', lang),
        description: await this.i18n.translate('user.otp_email_description', lang),
        label: await this.i18n.translate('user.otp_email_label', lang),
        expiry: await this.i18n.translate('user.otp_email_expiry', lang, { minutes: 10 }),
        support: await this.i18n.translate('user.otp_email_support', lang),
        contact: await this.i18n.translate('user.otp_email_contact', lang),
        footerCopyright: await this.i18n.translate('user.otp_email_footer_copyright', lang),
        footerSecurity: await this.i18n.translate('user.otp_email_footer_security', lang),
        legalNote: await this.i18n.translate('user.otp_email_legal_note', lang),
      };

      const subject = await this.i18n.translate('user.otp_login_subject', lang);

      await this.mailService.sendHtmlEmail(
        email,
        subject,
        'sendOtp.html',
        {
          otpCode,
          year: new Date().getFullYear(),
          translations,
          lang,
        }
      );
    } else if (validator.isMobilePhone(email, 'any')) {
      const message = await this.i18n.translate('user.otp_sms_body', lang, {
        otpCode,
      });
      const sent = await this.smsHelper.sendSms(email, message);
      if (!sent)
        throw new BadRequestException(
          await this.i18n.translate('user.sms_send_failed', lang),
        );
    }

    return {
      message: await this.i18n.translate('user.otp_sent', lang),
      otpCode,
    };
  }

  async sendResetPasswordOtp(email: string, lang: string = 'fr'): Promise<any> {
    const user = await this.usersRepository.findOne({
      where: [{ email }, { phone: email }],
    });
    if (!user) throw new BadRequestException(await this.i18n.translate('user.user_not_found', lang));

    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const otp = this.otpRepository.create({
      email,
      otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await this.otpRepository.save(otp);

    if (validator.isEmail(email)) {
      // âœ… Construire l'objet translations (identique Ã  sendOtp)
      const translations = {
        title: await this.i18n.translate('user.otp_email_title', lang),
        description: await this.i18n.translate('user.otp_email_description', lang),
        label: await this.i18n.translate('user.otp_email_label', lang),
        expiry: await this.i18n.translate('user.otp_email_expiry', lang, { minutes: 10 }),
        support: await this.i18n.translate('user.otp_email_support', lang),
        contact: await this.i18n.translate('user.otp_email_contact', lang),
        footerCopyright: await this.i18n.translate('user.otp_email_footer_copyright', lang),
        footerSecurity: await this.i18n.translate('user.otp_email_footer_security', lang),
        legalNote: await this.i18n.translate('user.otp_email_legal_note', lang),
      };

      const subject = await this.i18n.translate('user.reset_password_subject', lang);

      await this.mailService.sendHtmlEmail(
        email,
        subject,
        'sendOtp.html',
        {
          otpCode,
          year: new Date().getFullYear(),
          translations,   // âœ… nÃ©cessaire pour le template
          lang,           // âœ… nÃ©cessaire pour l'attribut lang du HTML
        }
      );
    } else if (validator.isMobilePhone(email, 'any')) {
      const message = await this.i18n.translate('user.reset_password_sms_body', lang, { otpCode });
      const sent = await this.smsHelper.sendSms(email, message);
      if (!sent) throw new BadRequestException(await this.i18n.translate('user.sms_send_failed', lang));
    }

    return { message: await this.i18n.translate('user.reset_otp_sent_success', lang) };
  }

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
    lang: string = 'fr',
  ): Promise<any> {
    const { email, otpCode, password } = resetPasswordDto;

    const otpEntry = await this.otpRepository.findOne({
      where: { email, otpCode, isUsed: false },
    });
    if (!otpEntry || new Date() > otpEntry.expiresAt) {
      throw new BadRequestException(
        await this.i18n.translate('user.otp_invalid', lang),
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.usersRepository.findOne({
      where: [{ email }, { phone: email }],
    });
    if (!user)
      throw new BadRequestException(
        await this.i18n.translate('user.user_not_found', lang),
      );

    user.password = hashedPassword;
    await this.usersRepository.save(user);

    otpEntry.isUsed = true;
    await this.otpRepository.save(otpEntry);

    return {
      message: await this.i18n.translate('user.password_reset_success', lang),
    };
  }

  async verifyOtp(
    email: string,
    otpCode: string,
    lang: string = 'fr',
  ): Promise<{ message: string }> {
    if (!email)
      throw new BadRequestException(
        await this.i18n.translate('user.email_or_phone_required', lang),
      );

    const otpEntry = await this.otpRepository.findOne({
      where: { email, otpCode, isUsed: false, expiresAt: MoreThan(new Date()) },
    });
    if (!otpEntry)
      throw new BadRequestException(
        await this.i18n.translate('user.otp_invalid', lang),
      );

    await this.otpRepository.save(otpEntry);
    return { message: await this.i18n.translate('user.otp_validated', lang) };
  }

  async getFullProfile(userId: string, lang: string = 'fr'): Promise<Record<string, any>> {
    let user = await this.usersRepository
      .createQueryBuilder('users')
      .addSelect('users.password')
      .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('company.companyResources', 'companyResources')
      .leftJoinAndSelect('companyResources.resource', 'resource')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('company.settings', 'companySettings')
      .leftJoinAndSelect('company.invoiceConfiguration', 'invoiceConfiguration')
      .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
      .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
      .leftJoinAndSelect('userPlatformRoles.role', 'role')
      .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
      .leftJoinAndSelect('defaultAddress.country', 'defaultAddressCountry')
      .leftJoinAndSelect('defaultAddress.city', 'defaultAddressCity')
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .leftJoinAndSelect('users.activeBranch', 'activeBranch')
      .leftJoinAndSelect('activeBranch.country', 'activeBranchCountry')
      .leftJoinAndSelect('activeBranch.city', 'activeBranchCity')
      .leftJoinAndSelect('users.loyalty', 'loyalty')
      .leftJoinAndSelect('users.referrals', 'referrals')
      .leftJoinAndSelect('users.referrer', 'referrer')
      .where('users.id = :id', { id: userId })
      .getOne();

    if (!user) throw new NotFoundException(await this.i18n.translate('user.user_not_found', lang));

    // ============================================================
    // ðŸ”¥ GARANTIR LE referralCode ET LE COMPTE FIDÃ‰LITÃ‰
    // âœ… OPTIMISATION : plus de reload, assignation locale
    // ============================================================

    if (!user.referralCode || user.referralCode.trim() === '') {
      console.warn(`âš ï¸ [getFullProfile] Utilisateur ${user.id} sans referralCode, gÃ©nÃ©ration...`);

      // âœ… OPTIMISATION : utilise directement generateReferralCode
      const newCode = await this.generateReferralCode(user.id);

      if (!newCode || newCode.trim() === '') {
        console.error(`âŒ [getFullProfile] Impossible de gÃ©nÃ©rer un referralCode pour ${user.id}`);
        throw new InternalServerErrorException(
          await this.i18n.translate('user.referral_code_generation_failed', lang),
        );
      }

      user.referralCode = newCode;
      await this.usersRepository.save(user);
      console.log(`âœ… [getFullProfile] referralCode gÃ©nÃ©rÃ©: ${newCode}`);
    }

    if (!user.loyalty || user.loyalty.length === 0) {
      const loyalty = await this.getOrCreateLoyaltyAccount(user.id);
      await this.loyaltyRepository.save(loyalty);

      // âœ… OPTIMISATION : assignation directe (plus de reload)
      user.loyalty = [loyalty];
    }

    const { password, ...userWithoutPassword } = user;

    // âœ… userHasCompany : ajout settings + invoiceConfiguration
    const userHasCompany = (userWithoutPassword.userHasCompany || []).map(
      (uhc) => ({
        id: uhc.id,
        isOwner: uhc.isOwner,
        company: uhc.company
          ? {
            ...uhc.company,
            tauxCompanies: uhc.company.tauxCompanies ?? [],
            country: uhc.company.country ?? null,
            city: uhc.company.city ?? null,
            category: uhc.company.category ?? null,
            settings: (uhc.company as any).settings ?? null,
            invoiceConfiguration:
              (uhc.company as any).invoiceConfiguration ?? null,
            branches: (uhc.company.branches || []).map((b) => ({
              id: b.id,
              name: b.name,
              address: b.address,
              phone: b.phone,
              email: b.email,
              status: b.status,
              deleted: b.deleted,
              country: b.country
                ? { id: b.country.id, name: b.country.name }
                : null,
              city: b.city ? { id: b.city.id, name: b.city.name } : null,
            })),
          }
          : null,
        branch: uhc.branch
          ? { id: uhc.branch.id, name: uhc.branch.name }
          : null,
        userResources: (uhc.resources || []).map((r) => ({
          id: r.id,
          canCreate: r.canCreate,
          canRead: r.canRead,
          canUpdate: r.canUpdate,
          canDelete: r.canDelete,
          canManage: r.canManage,
          status: r.status,
          resource: r.resource
            ? {
              id: r.resource.id,
              name: r.resource.name,
              label: r.resource.label,
            }
            : null,
        })),
      }),
    );

    // ============================================================
    // âœ… OPTIMISATION : activeCompany calculÃ©e depuis user.userHasCompany
    //    (plus de requÃªte activeCompanyRaw)
    // ============================================================
    const activeUserHasCompany = user.userHasCompany?.find(
      (uhc) => uhc.company?.id === user.activeCompanyId,
    );
    const activeCompanyEntity = activeUserHasCompany?.company ?? null;
    const activeCompanyBranch = activeUserHasCompany?.branch
      ? {
        id: activeUserHasCompany.branch.id,
        name: activeUserHasCompany.branch.name,
      }
      : null;

    const userResourcesForActiveCompany = (
      activeUserHasCompany?.resources || []
    ).map((r) => ({
      id: r.id,
      canCreate: r.canCreate,
      canRead: r.canRead,
      canUpdate: r.canUpdate,
      canDelete: r.canDelete,
      canManage: r.canManage,
      status: r.status,
      resource: r.resource
        ? {
          id: r.resource.id,
          name: r.resource.name,
          label: r.resource.label,
        }
        : null,
    }));

    // âœ… activeCompany : ajout settings + invoiceConfiguration
    const activeCompany = activeCompanyEntity
      ? {
        ...activeCompanyEntity,
        tauxCompanies: activeCompanyEntity.tauxCompanies ?? [],
        country: activeCompanyEntity.country ?? null,
        city: activeCompanyEntity.city ?? null,
        category: activeCompanyEntity.category ?? null,
        settings: (activeCompanyEntity as any).settings ?? null,
        invoiceConfiguration:
          (activeCompanyEntity as any).invoiceConfiguration ?? null,
        branch: activeCompanyBranch,
        companyResources: (activeCompanyEntity.companyResources || []).map(
          (cr) => ({
            id: cr.id,
            canCreate: cr.can_create,
            canRead: cr.can_read,
            canUpdate: cr.can_update,
            canDelete: cr.can_delete,
            canManage: cr.can_manage,
            status: cr.status,
            resource: cr.resource
              ? {
                id: cr.resource.id,
                name: cr.resource.name,
                label: cr.resource.label,
              }
              : null,
          }),
        ),
        userResources: userResourcesForActiveCompany,
        branches: (activeCompanyEntity.branches || []).map((b) => ({
          id: b.id,
          name: b.name,
          address: b.address,
          phone: b.phone,
          email: b.email,
          status: b.status,
          deleted: b.deleted,
          country: b.country
            ? { id: b.country.id, name: b.country.name }
            : null,
          city: b.city ? { id: b.city.id, name: b.city.name } : null,
        })),
      }
      : null;

    const userPlatformRoles = (userWithoutPassword.userPlatformRoles || []).map(
      (upr: any) => ({
        id: upr.id,
        platform: upr.platform,
        role: upr.role,
      }),
    );

    const defaultAddress = userWithoutPassword.defaultAddress
      ? {
        id: userWithoutPassword.defaultAddress.id,
        firstName: userWithoutPassword.defaultAddress.firstName,
        lastName: userWithoutPassword.defaultAddress.lastName,
        address: userWithoutPassword.defaultAddress.address,
        phone: userWithoutPassword.defaultAddress.phone,
        type: userWithoutPassword.defaultAddress.type,
        isDefault: userWithoutPassword.defaultAddress.isDefault,
        latitude: userWithoutPassword.defaultAddress.latitude,
        longitude: userWithoutPassword.defaultAddress.longitude,
        countryId: userWithoutPassword.defaultAddress.countryId,
        cityId: userWithoutPassword.defaultAddress.cityId,
        createdAt: userWithoutPassword.defaultAddress.createdAt,
        updatedAt: userWithoutPassword.defaultAddress.updatedAt,
        country: userWithoutPassword.defaultAddress.country
          ? {
            id: userWithoutPassword.defaultAddress.country.id,
            name: userWithoutPassword.defaultAddress.country.name,
            code: userWithoutPassword.defaultAddress.country.code,
            status: userWithoutPassword.defaultAddress.country.status,
            createdAt: userWithoutPassword.defaultAddress.country.createdAt,
            updatedAt: userWithoutPassword.defaultAddress.country.updatedAt,
            flag: userWithoutPassword.defaultAddress.country.flag,
          }
          : null,
        city: userWithoutPassword.defaultAddress.city
          ? {
            id: userWithoutPassword.defaultAddress.city.id,
            name: userWithoutPassword.defaultAddress.city.name,
          }
          : null,
      }
      : null;

    const activeBranch = userWithoutPassword.activeBranch
      ? {
        id: userWithoutPassword.activeBranch.id,
        name: userWithoutPassword.activeBranch.name,
        address: userWithoutPassword.activeBranch.address,
        phone: userWithoutPassword.activeBranch.phone,
        email: userWithoutPassword.activeBranch.email,
        status: userWithoutPassword.activeBranch.status,
        deleted: userWithoutPassword.activeBranch.deleted,
        country: userWithoutPassword.activeBranch.country
          ? {
            id: userWithoutPassword.activeBranch.country.id,
            name: userWithoutPassword.activeBranch.country.name,
          }
          : null,
        city: userWithoutPassword.activeBranch.city
          ? {
            id: userWithoutPassword.activeBranch.city.id,
            name: userWithoutPassword.activeBranch.city.name,
          }
          : null,
      }
      : null;

    const referralData = {
      referralCode: user.referralCode,
      referralCount: user.referralCount || 0,
      referralPoints: user.referralPoints || 0,
      referredBy: user.referredBy,
      referrerName: user.referrer?.fullName || null,
      referralActive: user.referralActive !== false,
      totalReferrals: user.referrals?.length || 0,
    };

    return instanceToPlain({
      ...userWithoutPassword,
      userHasCompany,
      activeCompany,
      userPlatformRoles,
      defaultAddress,
      activeBranch,
      loyalty: {
        points: user.loyalty?.[0]?.pointsBalance ?? 0,
        tier: user.loyalty?.[0]?.currentTier ?? null,
        code: user.loyalty?.[0]?.loyaltyCode ?? null,
      },
      referral: referralData,
    });
  }

  async accessToken(user: UserEntity): Promise<string> {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const secretKey = this.configService.get<string>('ACCESS_TOKEN_SECRET_KEY');
    if (!secretKey) {
      throw new Error('ACCESS_TOKEN_SECRET_KEY is not defined!');
    }

    return await this.jwtService.signAsync(payload, {
      expiresIn: '48h',
      secret: secretKey,
    });
  }

  async refreshToken(user: UserEntity): Promise<string> {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const secretKey = this.configService.get<string>(
      'REFRESH_TOKEN_SECRET_KEY',
    );
    if (!secretKey) {
      throw new Error('REFRESH_TOKEN_SECRET_KEY is not defined!');
    }

    return await this.jwtService.signAsync(payload, {
      expiresIn: '7d',
      secret: secretKey,
    });
  }

  async refreshTokenWithValidation(
    refresh_token: string,
    lang: string = 'fr',
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refresh_token) {
      throw new BadRequestException(
        await this.i18n.translate('user.refresh_token_required', lang),
      );
    }

    const secret = this.configService.get<string>('REFRESH_TOKEN_SECRET_KEY');
    if (!secret) {
      throw new Error('REFRESH_TOKEN_SECRET_KEY is not defined in .env');
    }

    let decoded: any;
    try {
      decoded = await this.jwtService.verifyAsync(refresh_token, { secret });
    } catch (err) {
      throw new BadRequestException(
        await this.i18n.translate('user.invalid_refresh_token', lang),
      );
    }

    const user = await this.usersRepository.findOne({
      where: { id: decoded.id },
    });
    if (!user) {
      throw new BadRequestException(
        await this.i18n.translate('user.user_not_found', lang),
      );
    }

    const newAccessToken = await this.accessToken(user);
    const newRefreshToken = await this.refreshToken(user);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  generateSecret(email: string) {
    return speakeasy.generateSecret({ name: `FavorApp (${email})` });
  }

  async generateQrCode(otpauthUrl: string): Promise<string> {
    return await qrcode.toDataURL(otpauthUrl);
  }

  async verifyToken(
    secret: string,
    token: string,
    lang?: string,
  ): Promise<boolean> {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 60,
    });
  }

  async findById(userId: string, lang: string = 'fr'): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(await this.i18n.translate('user.user_not_found', lang));
    }
    return user;
  }

  async getOne(
    userId: string,
    lang: string = 'fr',
  ): Promise<{
    message: string;
    data: any;
  }> {
    const user = await this.usersRepository
      .createQueryBuilder('users')
      .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('company.companyResources', 'companyResources')
      .leftJoinAndSelect('companyResources.resource', 'resource')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
      .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
      .leftJoinAndSelect('userPlatformRoles.role', 'role')
      .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .where('users.id = :userId', { userId })
      .getOne();

    if (!user) {
      throw new NotFoundException(
        await this.i18n.translate(
          'user.user_not_found',
          lang,
        ),
      );
    }

    const { password, ...userWithoutPassword } = user;

    const userHasCompany = (
      userWithoutPassword.userHasCompany || []
    ).map((uhc) => ({
      id: uhc.id,
      isOwner: uhc.isOwner,

      company: uhc.company
        ? {
          ...uhc.company,
          tauxCompanies: uhc.company.tauxCompanies ?? [],
          country: uhc.company.country ?? null,
          city: uhc.company.city ?? null,
          category: uhc.company.category ?? null,

          branches: (uhc.company.branches || []).map((b) => ({
            id: b.id,
            name: b.name,
            address: b.address,
            phone: b.phone,
            email: b.email,
            status: b.status,
            deleted: b.deleted,

            country: b.country
              ? {
                id: b.country.id,
                name: b.country.name,
              }
              : null,

            city: b.city
              ? {
                id: b.city.id,
                name: b.city.name,
              }
              : null,
          })),
        }
        : null,

      branch: uhc.branch
        ? {
          id: uhc.branch.id,
          name: uhc.branch.name,
        }
        : null,

      userResources: (uhc.resources || []).map((r) => ({
        id: r.id,
        canCreate: r.canCreate,
        canRead: r.canRead,
        canUpdate: r.canUpdate,
        canDelete: r.canDelete,
        canManage: r.canManage,
        status: r.status,

        resource: r.resource
          ? {
            id: r.resource.id,
            name: r.resource.name,
            label: r.resource.label,
          }
          : null,
      })),
    }));

    const activeUserHasCompany =
      userWithoutPassword.userHasCompany?.find(
        (uhc) =>
          uhc.company?.id ===
          userWithoutPassword.activeCompanyId,
      );

    const activeCompanyEntity =
      activeUserHasCompany?.company ?? null;

    const activeCompany = activeCompanyEntity
      ? {
        ...activeCompanyEntity,

        tauxCompanies:
          activeCompanyEntity.tauxCompanies ?? [],

        country:
          activeCompanyEntity.country ?? null,

        city:
          activeCompanyEntity.city ?? null,

        category:
          activeCompanyEntity.category ?? null,

        branch: activeUserHasCompany?.branch
          ? {
            id: activeUserHasCompany.branch.id,
            name: activeUserHasCompany.branch.name,
          }
          : null,

        companyResources: (
          activeCompanyEntity.companyResources || []
        ).map((cr) => ({
          id: cr.id,
          canCreate: cr.can_create,
          canRead: cr.can_read,
          canUpdate: cr.can_update,
          canDelete: cr.can_delete,
          canManage: cr.can_manage,
          status: cr.status,

          resource: cr.resource
            ? {
              id: cr.resource.id,
              name: cr.resource.name,
              label: cr.resource.label,
            }
            : null,
        })),

        userResources: (
          activeUserHasCompany?.resources || []
        ).map((r) => ({
          id: r.id,
          canCreate: r.canCreate,
          canRead: r.canRead,
          canUpdate: r.canUpdate,
          canDelete: r.canDelete,
          canManage: r.canManage,
          status: r.status,

          resource: r.resource
            ? {
              id: r.resource.id,
              name: r.resource.name,
              label: r.resource.label,
            }
            : null,
        })),

        branches: (
          activeCompanyEntity.branches || []
        ).map((b) => ({
          id: b.id,
          name: b.name,
          address: b.address,
          phone: b.phone,
          email: b.email,
          status: b.status,
          deleted: b.deleted,

          country: b.country
            ? {
              id: b.country.id,
              name: b.country.name,
            }
            : null,

          city: b.city
            ? {
              id: b.city.id,
              name: b.city.name,
            }
            : null,
        })),
      }
      : null;

    const userPlatformRoles = (
      userWithoutPassword.userPlatformRoles || []
    ).map((upr: any) => ({
      id: upr.id,
      platform: upr.platform,
      role: upr.role,
    }));

    const defaultAddress =
      userWithoutPassword.defaultAddress
        ? {
          id: userWithoutPassword.defaultAddress.id,
          firstName:
            userWithoutPassword.defaultAddress.firstName,
          lastName:
            userWithoutPassword.defaultAddress.lastName,
          address:
            userWithoutPassword.defaultAddress.address,
          phone:
            userWithoutPassword.defaultAddress.phone,
          type:
            userWithoutPassword.defaultAddress.type,
          isDefault:
            userWithoutPassword.defaultAddress.isDefault,
          latitude:
            userWithoutPassword.defaultAddress.latitude,
          longitude:
            userWithoutPassword.defaultAddress.longitude,
          createdAt:
            userWithoutPassword.defaultAddress.createdAt,
          updatedAt:
            userWithoutPassword.defaultAddress.updatedAt,
        }
        : null;

    const data = instanceToPlain({
      ...userWithoutPassword,
      userHasCompany,
      activeCompany,
      userPlatformRoles,
      defaultAddress,
    });

    return {
      message: await this.i18n.translate(
        'user.user_found',
        lang,
      ),
      data,
    };
  }

  async set2FASecret(
    userId: string,
    secret: string,
    lang?: string,
  ): Promise<void> {
    await this.usersRepository.update(userId, { twoFASecret: secret });
  }

  async enable2FA(userId: string, lang: string = 'fr'): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(await this.i18n.translate('user.user_not_found', lang));
    }
    user.isTwoFAEnabled = true;
    await this.usersRepository.save(user);
  }

  async findAll(role?: string): Promise<any[]> {
    const roles = Object.values(UserRole);
    let queryBuilder = this.usersRepository
      .createQueryBuilder('users')
      .addSelect('users.password')
      .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('company.companyResources', 'companyResources')
      .leftJoinAndSelect('companyResources.resource', 'resource')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
      .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
      .leftJoinAndSelect('userPlatformRoles.role', 'role')
      .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .leftJoinAndSelect('users.loyalty', 'loyalty')
      .orderBy('users.createdAt', 'DESC');

    if (role && roles.includes(role as UserRole)) {
      queryBuilder = queryBuilder.where('users.role = :role', { role });
    }

    const users = await queryBuilder.getMany();

    const sanitizedUsers = users.map((user) => {
      const { password, ...userWithoutPassword } = user;

      const userHasCompany = (userWithoutPassword.userHasCompany || []).map(
        (uhc) => ({
          id: uhc.id,
          isOwner: uhc.isOwner,
          company: uhc.company
            ? {
              ...uhc.company,
              tauxCompanies: uhc.company.tauxCompanies ?? [],
              country: uhc.company.country ?? null,
              city: uhc.company.city ?? null,
              category: uhc.company.category ?? null,
              branches: (uhc.company.branches || []).map((b) => ({
                id: b.id,
                name: b.name,
                address: b.address,
                phone: b.phone,
                email: b.email,
                status: b.status,
                deleted: b.deleted,
                country: b.country
                  ? { id: b.country.id, name: b.country.name }
                  : null,
                city: b.city ? { id: b.city.id, name: b.city.name } : null,
              })),
            }
            : null,
          branch: uhc.branch
            ? { id: uhc.branch.id, name: uhc.branch.name }
            : null,
          userResources: (uhc.resources || []).map((r) => ({
            id: r.id,
            canCreate: r.canCreate,
            canRead: r.canRead,
            canUpdate: r.canUpdate,
            canDelete: r.canDelete,
            canManage: r.canManage,
            status: r.status,
            resource: r.resource
              ? {
                id: r.resource.id,
                name: r.resource.name,
                label: r.resource.label,
              }
              : null,
          })),
        }),
      );

      // Reconstruire activeCompany avec sa branche
      const activeUserHasCompany = userWithoutPassword.userHasCompany?.find(
        (uhc) => uhc.company?.id === userWithoutPassword.activeCompanyId,
      );
      const activeCompanyEntity = activeUserHasCompany?.company ?? null;
      const activeCompanyBranch = activeUserHasCompany?.branch
        ? {
          id: activeUserHasCompany.branch.id,
          name: activeUserHasCompany.branch.name,
        }
        : null;

      const activeCompany = activeCompanyEntity
        ? {
          ...activeCompanyEntity,
          tauxCompanies: activeCompanyEntity.tauxCompanies ?? [],
          country: activeCompanyEntity.country ?? null,
          city: activeCompanyEntity.city ?? null,
          category: activeCompanyEntity.category ?? null,
          branch: activeCompanyBranch,
          companyResources: (activeCompanyEntity.companyResources || []).map(
            (cr) => ({
              id: cr.id,
              canCreate: cr.can_create,
              canRead: cr.can_read,
              canUpdate: cr.can_update,
              canDelete: cr.can_delete,
              canManage: cr.can_manage,
              status: cr.status,
              resource: cr.resource
                ? {
                  id: cr.resource.id,
                  name: cr.resource.name,
                  label: cr.resource.label,
                }
                : null,
            }),
          ),
          userResources: (activeUserHasCompany?.resources || []).map((r) => ({
            id: r.id,
            canCreate: r.canCreate,
            canRead: r.canRead,
            canUpdate: r.canUpdate,
            canDelete: r.canDelete,
            canManage: r.canManage,
            status: r.status,
            resource: r.resource
              ? {
                id: r.resource.id,
                name: r.resource.name,
                label: r.resource.label,
              }
              : null,
          })),
          branches: (activeCompanyEntity.branches || []).map((b) => ({
            id: b.id,
            name: b.name,
            address: b.address,
            phone: b.phone,
            email: b.email,
            status: b.status,
            deleted: b.deleted,
            country: b.country
              ? { id: b.country.id, name: b.country.name }
              : null,
            city: b.city ? { id: b.city.id, name: b.city.name } : null,
          })),
        }
        : null;

      const userPlatformRoles = (
        userWithoutPassword.userPlatformRoles || []
      ).map((upr: any) => ({
        id: upr.id,
        platform: upr.platform,
        role: upr.role,
      }));

      const defaultAddress = userWithoutPassword.defaultAddress
        ? {
          id: userWithoutPassword.defaultAddress.id,
          firstName: userWithoutPassword.defaultAddress.firstName,
          lastName: userWithoutPassword.defaultAddress.lastName,
          address: userWithoutPassword.defaultAddress.address,
          phone: userWithoutPassword.defaultAddress.phone,
          type: userWithoutPassword.defaultAddress.type,
          isDefault: userWithoutPassword.defaultAddress.isDefault,
          latitude: userWithoutPassword.defaultAddress.latitude,
          longitude: userWithoutPassword.defaultAddress.longitude,
          createdAt: userWithoutPassword.defaultAddress.createdAt,
          updatedAt: userWithoutPassword.defaultAddress.updatedAt,
        }
        : null;

      return instanceToPlain({
        ...userWithoutPassword,
        userHasCompany,
        activeCompany,
        userPlatformRoles,
        defaultAddress,
        loyalty: {
          points: user.loyalty?.[0]?.pointsBalance ?? 0,
          tier: user.loyalty?.[0]?.currentTier ?? null,
          code: user.loyalty?.[0]?.loyaltyCode ?? null,
        },
      });
    });

    return sanitizedUsers;
  }

  // ==================== findAllWithDetails ====================
  async findAllWithDetails(
    role?: UserRole,
    hasOrder?: boolean,
    hasShipment?: boolean,
    search?: string,
  ) {
    const query = this.usersRepository
      .createQueryBuilder('users')
      .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('company.companyResources', 'companyResources')
      .leftJoinAndSelect('companyResources.resource', 'resource')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
      .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
      .leftJoinAndSelect('userPlatformRoles.role', 'role')
      .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      );

    // FILTRE PAR RÃ”LE
    if (role) {
      query.andWhere('users.role = :role', { role });
    }

    // RECHERCHE
    if (search && search.trim()) {
      const keyword = `%${search.trim()}%`;

      query.andWhere(
        `(
        users.fullName LIKE :keyword
        OR users.email LIKE :keyword
        OR users.phone LIKE :keyword
      )`,
        { keyword },
      );
    }

    // UTILISATEURS AYANT AU MOINS UNE COMMANDE
    if (hasOrder === true) {
      query.andWhere(`
      EXISTS (
        SELECT 1
        FROM orders order_filter
        WHERE order_filter.userId = users.id
      )
    `);
    }

    // UTILISATEURS AYANT AU MOINS UN SHIPMENT
    // Aucun filtre sur LTA
    if (hasShipment === true) {
      query.andWhere(`
      EXISTS (
        SELECT 1
        FROM shipments shipment_filter
        WHERE shipment_filter.userId = users.id
      )
    `);
    }

    query.orderBy('users.createdAt', 'DESC');

    const users = await query.getMany();

    const sanitizedUsers = users.map((user) => {
      const { password, ...userWithoutPassword } = user;

      const userHasCompany = (
        userWithoutPassword.userHasCompany || []
      ).map((uhc) => ({
        id: uhc.id,
        isOwner: uhc.isOwner,

        company: uhc.company
          ? {
            ...uhc.company,
            tauxCompanies: uhc.company.tauxCompanies ?? [],
            country: uhc.company.country ?? null,
            city: uhc.company.city ?? null,
            category: uhc.company.category ?? null,

            branches: (uhc.company.branches || []).map((b) => ({
              id: b.id,
              name: b.name,
              address: b.address,
              phone: b.phone,
              email: b.email,
              status: b.status,
              deleted: b.deleted,

              country: b.country
                ? {
                  id: b.country.id,
                  name: b.country.name,
                }
                : null,

              city: b.city
                ? {
                  id: b.city.id,
                  name: b.city.name,
                }
                : null,
            })),
          }
          : null,

        branch: uhc.branch
          ? {
            id: uhc.branch.id,
            name: uhc.branch.name,
          }
          : null,

        userResources: (uhc.resources || []).map((r) => ({
          id: r.id,
          canCreate: r.canCreate,
          canRead: r.canRead,
          canUpdate: r.canUpdate,
          canDelete: r.canDelete,
          canManage: r.canManage,
          status: r.status,

          resource: r.resource
            ? {
              id: r.resource.id,
              name: r.resource.name,
              label: r.resource.label,
            }
            : null,
        })),
      }));

      const activeUserHasCompany =
        userWithoutPassword.userHasCompany?.find(
          (uhc) =>
            uhc.company?.id === userWithoutPassword.activeCompanyId,
        );

      const activeCompanyEntity =
        activeUserHasCompany?.company ?? null;

      const activeCompanyBranch = activeUserHasCompany?.branch
        ? {
          id: activeUserHasCompany.branch.id,
          name: activeUserHasCompany.branch.name,
        }
        : null;

      const activeCompany = activeCompanyEntity
        ? {
          ...activeCompanyEntity,

          tauxCompanies: activeCompanyEntity.tauxCompanies ?? [],
          country: activeCompanyEntity.country ?? null,
          city: activeCompanyEntity.city ?? null,
          category: activeCompanyEntity.category ?? null,

          branch: activeCompanyBranch,

          companyResources: (
            activeCompanyEntity.companyResources || []
          ).map((cr) => ({
            id: cr.id,
            canCreate: cr.can_create,
            canRead: cr.can_read,
            canUpdate: cr.can_update,
            canDelete: cr.can_delete,
            canManage: cr.can_manage,
            status: cr.status,

            resource: cr.resource
              ? {
                id: cr.resource.id,
                name: cr.resource.name,
                label: cr.resource.label,
              }
              : null,
          })),

          userResources: (
            activeUserHasCompany?.resources || []
          ).map((r) => ({
            id: r.id,
            canCreate: r.canCreate,
            canRead: r.canRead,
            canUpdate: r.canUpdate,
            canDelete: r.canDelete,
            canManage: r.canManage,
            status: r.status,

            resource: r.resource
              ? {
                id: r.resource.id,
                name: r.resource.name,
                label: r.resource.label,
              }
              : null,
          })),

          branches: (
            activeCompanyEntity.branches || []
          ).map((b) => ({
            id: b.id,
            name: b.name,
            address: b.address,
            phone: b.phone,
            email: b.email,
            status: b.status,
            deleted: b.deleted,

            country: b.country
              ? {
                id: b.country.id,
                name: b.country.name,
              }
              : null,

            city: b.city
              ? {
                id: b.city.id,
                name: b.city.name,
              }
              : null,
          })),
        }
        : null;

      const userPlatformRoles = (
        userWithoutPassword.userPlatformRoles || []
      ).map((upr: any) => ({
        id: upr.id,
        platform: upr.platform,
        role: upr.role,
      }));

      const defaultAddress = userWithoutPassword.defaultAddress
        ? {
          id: userWithoutPassword.defaultAddress.id,
          firstName: userWithoutPassword.defaultAddress.firstName,
          lastName: userWithoutPassword.defaultAddress.lastName,
          address: userWithoutPassword.defaultAddress.address,
          phone: userWithoutPassword.defaultAddress.phone,
          type: userWithoutPassword.defaultAddress.type,
          isDefault: userWithoutPassword.defaultAddress.isDefault,
          latitude: userWithoutPassword.defaultAddress.latitude,
          longitude: userWithoutPassword.defaultAddress.longitude,
          createdAt: userWithoutPassword.defaultAddress.createdAt,
          updatedAt: userWithoutPassword.defaultAddress.updatedAt,
        }
        : null;

      return instanceToPlain({
        ...userWithoutPassword,
        userHasCompany,
        activeCompany,
        userPlatformRoles,
        defaultAddress,
      });
    });

    return sanitizedUsers;
  }

  async findAllWithDetailsPaginate(
    page: number = 1,
    limit: number = 10,
    role?: UserRole,
    hasOrder?: boolean,
    hasShipment?: boolean,
    search?: string,
  ): Promise<{ data: PaginatedResponseDto<any> }> {
    const query = this.usersRepository
      .createQueryBuilder('users')
      .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('company.companyResources', 'companyResources')
      .leftJoinAndSelect('companyResources.resource', 'resource')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
      .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
      .leftJoinAndSelect('userPlatformRoles.role', 'role')
      .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      );

    // FILTRE PAR RÃ”LE
    if (role) {
      query.andWhere('users.role = :role', { role });
    }

    // RECHERCHE
    if (search && search.trim()) {
      const keyword = `%${search.trim()}%`;

      query.andWhere(
        `(
        users.fullName LIKE :keyword
        OR users.email LIKE :keyword
        OR users.phone LIKE :keyword
      )`,
        { keyword },
      );
    }

    // UTILISATEURS AYANT AU MOINS UNE COMMANDE
    if (hasOrder === true) {
      query.andWhere(`
      EXISTS (
        SELECT 1
        FROM orders order_filter
        WHERE order_filter.userId = users.id
      )
    `);
    }

    // UTILISATEURS AYANT AU MOINS UN SHIPMENT
    // Aucun filtre sur LTA
    if (hasShipment === true) {
      query.andWhere(`
      EXISTS (
        SELECT 1
        FROM shipments shipment_filter
        WHERE shipment_filter.userId = users.id
      )
    `);
    }

    const skip = (page - 1) * limit;

    query
      .orderBy('users.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [users, total] = await query.getManyAndCount();

    const sanitizedUsers = users.map((user) => {
      const { password, ...userWithoutPassword } = user;

      const userHasCompany = (
        userWithoutPassword.userHasCompany || []
      ).map((uhc) => ({
        id: uhc.id,
        isOwner: uhc.isOwner,

        company: uhc.company
          ? {
            ...uhc.company,
            tauxCompanies: uhc.company.tauxCompanies ?? [],
            country: uhc.company.country ?? null,
            city: uhc.company.city ?? null,
            category: uhc.company.category ?? null,

            branches: (uhc.company.branches || []).map((b) => ({
              id: b.id,
              name: b.name,
              address: b.address,
              phone: b.phone,
              email: b.email,
              status: b.status,
              deleted: b.deleted,

              country: b.country
                ? {
                  id: b.country.id,
                  name: b.country.name,
                }
                : null,

              city: b.city
                ? {
                  id: b.city.id,
                  name: b.city.name,
                }
                : null,
            })),
          }
          : null,

        branch: uhc.branch
          ? {
            id: uhc.branch.id,
            name: uhc.branch.name,
          }
          : null,

        userResources: (uhc.resources || []).map((r) => ({
          id: r.id,
          canCreate: r.canCreate,
          canRead: r.canRead,
          canUpdate: r.canUpdate,
          canDelete: r.canDelete,
          canManage: r.canManage,
          status: r.status,

          resource: r.resource
            ? {
              id: r.resource.id,
              name: r.resource.name,
              label: r.resource.label,
            }
            : null,
        })),
      }));

      const activeUserHasCompany =
        userWithoutPassword.userHasCompany?.find(
          (uhc) =>
            uhc.company?.id === userWithoutPassword.activeCompanyId,
        );

      const activeCompanyEntity =
        activeUserHasCompany?.company ?? null;

      const activeCompanyBranch = activeUserHasCompany?.branch
        ? {
          id: activeUserHasCompany.branch.id,
          name: activeUserHasCompany.branch.name,
        }
        : null;

      const activeCompany = activeCompanyEntity
        ? {
          ...activeCompanyEntity,

          tauxCompanies: activeCompanyEntity.tauxCompanies ?? [],
          country: activeCompanyEntity.country ?? null,
          city: activeCompanyEntity.city ?? null,
          category: activeCompanyEntity.category ?? null,

          branch: activeCompanyBranch,

          companyResources: (
            activeCompanyEntity.companyResources || []
          ).map((cr) => ({
            id: cr.id,
            canCreate: cr.can_create,
            canRead: cr.can_read,
            canUpdate: cr.can_update,
            canDelete: cr.can_delete,
            canManage: cr.can_manage,
            status: cr.status,

            resource: cr.resource
              ? {
                id: cr.resource.id,
                name: cr.resource.name,
                label: cr.resource.label,
              }
              : null,
          })),

          userResources: (
            activeUserHasCompany?.resources || []
          ).map((r) => ({
            id: r.id,
            canCreate: r.canCreate,
            canRead: r.canRead,
            canUpdate: r.canUpdate,
            canDelete: r.canDelete,
            canManage: r.canManage,
            status: r.status,

            resource: r.resource
              ? {
                id: r.resource.id,
                name: r.resource.name,
                label: r.resource.label,
              }
              : null,
          })),

          branches: (
            activeCompanyEntity.branches || []
          ).map((b) => ({
            id: b.id,
            name: b.name,
            address: b.address,
            phone: b.phone,
            email: b.email,
            status: b.status,
            deleted: b.deleted,

            country: b.country
              ? {
                id: b.country.id,
                name: b.country.name,
              }
              : null,

            city: b.city
              ? {
                id: b.city.id,
                name: b.city.name,
              }
              : null,
          })),
        }
        : null;

      const userPlatformRoles = (
        userWithoutPassword.userPlatformRoles || []
      ).map((upr: any) => ({
        id: upr.id,
        platform: upr.platform,
        role: upr.role,
      }));

      const defaultAddress = userWithoutPassword.defaultAddress
        ? {
          id: userWithoutPassword.defaultAddress.id,
          firstName: userWithoutPassword.defaultAddress.firstName,
          lastName: userWithoutPassword.defaultAddress.lastName,
          address: userWithoutPassword.defaultAddress.address,
          phone: userWithoutPassword.defaultAddress.phone,
          type: userWithoutPassword.defaultAddress.type,
          isDefault: userWithoutPassword.defaultAddress.isDefault,
          latitude: userWithoutPassword.defaultAddress.latitude,
          longitude: userWithoutPassword.defaultAddress.longitude,
          createdAt: userWithoutPassword.defaultAddress.createdAt,
          updatedAt: userWithoutPassword.defaultAddress.updatedAt,
        }
        : null;

      return instanceToPlain({
        ...userWithoutPassword,
        userHasCompany,
        activeCompany,
        userPlatformRoles,
        defaultAddress,
      });
    });

    return {
      data: new PaginatedResponseDto(
        sanitizedUsers,
        total,
        page,
        limit,
      ),
    };
  }
  // ============================================================
  // ðŸ”„ CHANGER LE RÃ”LE D'UN UTILISATEUR
  // ============================================================
  async changeUserRole(
    targetUserId: string,
    newRole: UserRole,
    currentUser: UserEntity,       // utilisateur qui effectue l'action
    lang: string = 'fr',
    reason?: string,
  ) {

    // ============================================================
    // 1. RÃ©cupÃ©rer l'utilisateur cible
    // ============================================================
    const targetUser = await this.usersRepository.findOne({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException(
        await this.i18n.translate('user.not_found', lang),
      );
    }

    // ============================================================
    // 2. VÃ©rifications de sÃ©curitÃ©
    // ============================================================

    // âŒ Interdire de changer son propre rÃ´le
    if (targetUser.id === currentUser.id) {
      throw new BadRequestException(
        await this.i18n.translate('user.cannot_change_own_role', lang),
      );
    }

    // âŒ Interdire de modifier un SUPER_ADMIN (sauf par un SUPER_ADMIN lui-mÃªme)
    if (
      targetUser.role === UserRole.SUPER_ADMIN &&
      currentUser.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        await this.i18n.translate('user.cannot_modify_super_admin', lang),
      );
    }

    // âŒ Interdire de promouvoir quelqu'un en SUPER_ADMIN (sauf SUPER_ADMIN)
    if (
      newRole === UserRole.SUPER_ADMIN &&
      currentUser.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        await this.i18n.translate('user.cannot_promote_super_admin', lang),
      );
    }

    // âŒ Interdire un rÃ´le identique (pas de changement inutile)
    if (targetUser.role === newRole) {
      throw new BadRequestException(
        await this.i18n.translate('user.same_role', lang, { role: newRole }),
      );
    }

    // ============================================================
    // 3. Appliquer le changement
    // ============================================================
    const oldRole = targetUser.role;
    targetUser.role = newRole;

    const updated = await this.usersRepository.save(targetUser);

    // 4. (Optionnel) Log d'audit
    // ============================================================

    return {
      message: await this.i18n.translate('user.role_changed', lang, {
        fullName: updated.fullName,
        role: newRole,
      }),
      data: {
        id: updated.id,
        fullName: updated.fullName,
        email: updated.email,
        newRole: updated.role,
        updatedAt: updated.updatedAt,
      },
    };
  }

  async findOne(
    id: string,
    lang: string = 'fr',
  ): Promise<{
    message: string;
    data: any;
  }> {
    const user = await this.usersRepository
      .createQueryBuilder('users')
      .leftJoinAndSelect(
        'users.userHasCompany',
        'userHasCompany',
      )
      .leftJoinAndSelect(
        'userHasCompany.branch',
        'userHasCompanyBranch',
      )
      .leftJoinAndSelect(
        'userHasCompany.company',
        'company',
      )
      .leftJoinAndSelect(
        'company.tauxCompanies',
        'tauxCompanies',
      )
      .leftJoinAndSelect(
        'company.country',
        'country',
      )
      .leftJoinAndSelect(
        'company.city',
        'city',
      )
      .leftJoinAndSelect(
        'company.category',
        'category',
      )
      .leftJoinAndSelect(
        'company.companyResources',
        'companyResources',
      )
      .leftJoinAndSelect(
        'companyResources.resource',
        'resource',
      )
      .leftJoinAndSelect(
        'company.branches',
        'branches',
      )
      .leftJoinAndSelect(
        'users.userPlatformRoles',
        'userPlatformRoles',
      )
      .leftJoinAndSelect(
        'userPlatformRoles.platform',
        'platform',
      )
      .leftJoinAndSelect(
        'userPlatformRoles.role',
        'role',
      )
      .leftJoinAndSelect(
        'users.defaultAddress',
        'defaultAddress',
      )
      .leftJoinAndSelect(
        'userHasCompany.resources',
        'userCompanyResources',
      )
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .where('users.id = :id', { id })
      .getOne();

    if (!user) {
      throw new NotFoundException(
        await this.i18n.translate(
          'user.user_not_found',
          lang,
        ),
      );
    }

    const { password, ...userWithoutPassword } = user;

    const userHasCompany = (
      userWithoutPassword.userHasCompany || []
    ).map((uhc) => ({
      id: uhc.id,
      isOwner: uhc.isOwner,

      company: uhc.company
        ? {
          ...uhc.company,

          tauxCompanies:
            uhc.company.tauxCompanies ?? [],

          country:
            uhc.company.country ?? null,

          city:
            uhc.company.city ?? null,

          category:
            uhc.company.category ?? null,

          branches: (
            uhc.company.branches || []
          ).map((b) => ({
            id: b.id,
            name: b.name,
            address: b.address,
            phone: b.phone,
            email: b.email,
            status: b.status,
            deleted: b.deleted,

            country: b.country
              ? {
                id: b.country.id,
                name: b.country.name,
              }
              : null,

            city: b.city
              ? {
                id: b.city.id,
                name: b.city.name,
              }
              : null,
          })),
        }
        : null,

      branch: uhc.branch
        ? {
          id: uhc.branch.id,
          name: uhc.branch.name,
        }
        : null,

      userResources: (
        uhc.resources || []
      ).map((r) => ({
        id: r.id,
        canCreate: r.canCreate,
        canRead: r.canRead,
        canUpdate: r.canUpdate,
        canDelete: r.canDelete,
        canManage: r.canManage,
        status: r.status,

        resource: r.resource
          ? {
            id: r.resource.id,
            name: r.resource.name,
            label: r.resource.label,
          }
          : null,
      })),
    }));

    const activeUserHasCompany =
      userWithoutPassword.userHasCompany?.find(
        (uhc) =>
          uhc.company?.id ===
          userWithoutPassword.activeCompanyId,
      );

    const activeCompanyEntity =
      activeUserHasCompany?.company ?? null;

    const activeCompany =
      activeCompanyEntity
        ? {
          ...activeCompanyEntity,

          tauxCompanies:
            activeCompanyEntity.tauxCompanies ?? [],

          country:
            activeCompanyEntity.country ?? null,

          city:
            activeCompanyEntity.city ?? null,

          category:
            activeCompanyEntity.category ?? null,

          branch:
            activeUserHasCompany?.branch
              ? {
                id:
                  activeUserHasCompany.branch.id,
                name:
                  activeUserHasCompany.branch.name,
              }
              : null,

          companyResources: (
            activeCompanyEntity.companyResources || []
          ).map((cr) => ({
            id: cr.id,
            canCreate: cr.can_create,
            canRead: cr.can_read,
            canUpdate: cr.can_update,
            canDelete: cr.can_delete,
            canManage: cr.can_manage,
            status: cr.status,

            resource: cr.resource
              ? {
                id: cr.resource.id,
                name: cr.resource.name,
                label: cr.resource.label,
              }
              : null,
          })),

          userResources: (
            activeUserHasCompany?.resources || []
          ).map((r) => ({
            id: r.id,
            canCreate: r.canCreate,
            canRead: r.canRead,
            canUpdate: r.canUpdate,
            canDelete: r.canDelete,
            canManage: r.canManage,
            status: r.status,

            resource: r.resource
              ? {
                id: r.resource.id,
                name: r.resource.name,
                label: r.resource.label,
              }
              : null,
          })),

          branches: (
            activeCompanyEntity.branches || []
          ).map((b) => ({
            id: b.id,
            name: b.name,
            address: b.address,
            phone: b.phone,
            email: b.email,
            status: b.status,
            deleted: b.deleted,

            country: b.country
              ? {
                id: b.country.id,
                name: b.country.name,
              }
              : null,

            city: b.city
              ? {
                id: b.city.id,
                name: b.city.name,
              }
              : null,
          })),
        }
        : null;

    const userPlatformRoles = (
      userWithoutPassword.userPlatformRoles || []
    ).map((upr: any) => ({
      id: upr.id,
      platform: upr.platform,
      role: upr.role,
    }));

    const defaultAddress =
      userWithoutPassword.defaultAddress
        ? {
          id:
            userWithoutPassword.defaultAddress.id,

          firstName:
            userWithoutPassword.defaultAddress.firstName,

          lastName:
            userWithoutPassword.defaultAddress.lastName,

          address:
            userWithoutPassword.defaultAddress.address,

          phone:
            userWithoutPassword.defaultAddress.phone,

          type:
            userWithoutPassword.defaultAddress.type,

          isDefault:
            userWithoutPassword.defaultAddress.isDefault,

          latitude:
            userWithoutPassword.defaultAddress.latitude,

          longitude:
            userWithoutPassword.defaultAddress.longitude,

          createdAt:
            userWithoutPassword.defaultAddress.createdAt,

          updatedAt:
            userWithoutPassword.defaultAddress.updatedAt,
        }
        : null;

    const data = instanceToPlain({
      ...userWithoutPassword,
      userHasCompany,
      activeCompany,
      userPlatformRoles,
      defaultAddress,
    });

    return {
      message: await this.i18n.translate(
        'user.user_found',
        lang,
      ),
      data,
    };
  }

  async findUserByEmail(email: string) {
    return await this.usersRepository.findOneBy({ email });
  }

  async remove(id: string, lang: string = 'fr') {
    const user = await this.findOne(id, lang);
    await this.usersRepository.remove(user.data);
    return { message: await this.i18n.translate('user.user_deleted_success_admin', lang, { id }) };
  }

  async toggleUserActiveStatus(userId: string, lang: string = 'fr') {
    // 1ï¸âƒ£ RÃ©cupÃ©rer l'utilisateur avec toutes ses relations
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: [
        'activeCompany',
        'addresses',
        'userPlatformRoles',
        'userPlatformRoles.platform',
        'userPlatformRoles.role',
        'userHasResources',
        'userHasResources.resource',
        'userHasCompany',
        'userHasCompany.company',
        'userHasCompany.permissions',
        'userHasCompany.permissions.permission',
        'defaultAddress',
      ],
    });

    if (!user) {
      throw new NotFoundException(await this.i18n.translate('user.user_not_found', lang));
    }

    // 2ï¸ Basculer automatiquement le statut (true â†’ false, false â†’ true)
    user.isActive = !user.isActive;
    await this.usersRepository.save(user);

    // 3ï¸âƒ£ Supprimer le mot de passe avant retour
    const { password, ...rest } = user;

    const messageKey = user.isActive ? 'user.user_activated' : 'user.user_deactivated';
    return {
      message: await this.i18n.translate(messageKey, lang),
      data: rest,
    };
  }

  async deleteOwnAccount(
    userId: string,
    password: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: any }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: [
        'id',
        'fullName',
        'email',
        'phone',
        'deleted',
        'isActive',
        'password',
      ],
    });

    if (!password)
      throw new BadRequestException(
        await this.i18n.translate(
          'user.delete_account_password_required',
          lang,
        ),
      );
    if (!user)
      throw new NotFoundException(
        await this.i18n.translate('user.user_not_found', lang),
      );

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      throw new BadRequestException(
        await this.i18n.translate('user.password_incorrect', lang),
      );

    user.deleted = true;
    const savedUser = await this.usersRepository.save(user);

    return {
      message: await this.i18n.translate('user.account_deleted_success', lang),
      data: {
        id: savedUser.id,
        fullName: savedUser.fullName,
        email: savedUser.email,
        phone: savedUser.phone,
        deleted: savedUser.deleted,
      },
    };
  }

  async updateUserBranch(
    userId: string,
    branchId: string,
    lang: string = 'fr',
  ): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user)
      throw new NotFoundException(
        await this.i18n.translate('user.user_not_found', lang),
      );
    user.activeBranchId = branchId;
    return this.usersRepository.save(user);
  }

  async registerDeviceToken(
    userId: string,
    fcmToken: string,
    lang: string = 'fr',
  ): Promise<DeviceToken> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user)
      throw new BadRequestException(
        await this.i18n.translate('user.user_not_found', lang),
      );

    if (!fcmToken || !fcmToken.trim())
      throw new BadRequestException(
        await this.i18n.translate('user.fcm_token_required', lang),
      );
    const cleanToken = fcmToken.trim();

    let deviceToken = await this.deviceTokenRepo.findOne({
      where: { token: cleanToken },
    });
    if (deviceToken) {
      deviceToken.userId = userId;
      deviceToken.updatedAt = new Date();
      deviceToken = await this.deviceTokenRepo.save(deviceToken);
    } else {
      const newToken = this.deviceTokenRepo.create({
        userId,
        token: cleanToken,
        platform: 'unknown',
      });
      deviceToken = await this.deviceTokenRepo.save(newToken);
    }
    return deviceToken;
  }

  async getUserSettings(
    userId: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: UserSettingsEntity }> {
    let settings = await this.settingsRepo.findOne({ where: { userId } });
    if (!settings) {
      settings = this.settingsRepo.create({ userId });
      await this.settingsRepo.save(settings);
    }
    return {
      message: await this.i18n.translate('user.settings_retrieved', lang),
      data: settings,
    };
  }

  async updateUserSettings(
    userId: string,
    dto: UpdateUserSettingsDto,
    lang: string = 'fr',
  ): Promise<{ message: string; data: UserSettingsEntity }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user)
      throw new NotFoundException(
        await this.i18n.translate('user.user_not_found', lang),
      );

    const updateData: Partial<UserSettingsEntity> = { ...dto };
    if (dto.theme) updateData.theme = dto.theme.toLowerCase();

    let settings = await this.settingsRepo.findOne({ where: { userId } });
    if (settings) {
      Object.assign(settings, updateData);
      settings = await this.settingsRepo.save(settings);
    } else {
      const newSettings = this.settingsRepo.create({ userId, ...updateData });
      settings = await this.settingsRepo.save(newSettings);
    }

    return {
      message: await this.i18n.translate('user.settings_updated', lang),
      data: settings,
    };
  }

  // ============================================================
  // ðŸ”§ CRÃ‰ER UN UTILISATEUR PAR UN ADMIN
  // ============================================================
  async createUserByAdmin(
    dto: CreateUserByAdminDto,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: any }> {
    // 1. SÃ©curitÃ© : SUPER_ADMIN uniquement par SUPER_ADMIN
    if (
      dto.role === UserRole.SUPER_ADMIN &&
      currentUser.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        await this.i18n.translate('user.cannot_promote_super_admin', lang),
      );
    }
    const DEFAULT_USER_PASSWORD = 'FavorHelp@2025';
    if (!dto.email && !dto.phone) {
      throw new BadRequestException(
        await this.i18n.translate('user.email_or_phone_required', lang),
      );
    }

    // 2. Doublons
    const existing = await this.usersRepository.findOne({
      where: [
        ...(dto.email ? [{ email: dto.email }] : []),
        ...(dto.phone ? [{ phone: dto.phone }] : []),
      ],
    });

    if (existing) {
      throw new BadRequestException(
        await this.i18n.translate('user.account_exists', lang),
      );
    }

    // 3. Mot de passe (par dÃ©faut si non fourni)
    const usedDefaultPassword = !dto.password || dto.password.trim() === '';
    const rawPassword = usedDefaultPassword ? DEFAULT_USER_PASSWORD : dto.password!;
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    // 4. CrÃ©ation
    const newUser = this.usersRepository.create({
      fullName: dto.fullName,
      email: dto.email || undefined,
      phone: dto.phone || undefined,
      password: hashedPassword,
      role: dto.role,
      isActive: true,
      provider: 'admin',
      country: dto.country,
      city: dto.city,
      address: dto.address,
      image: dto.image,
      vehicleType: dto.vehicleType,
      plateNumber: dto.plateNumber,
    });

    const savedUser = await this.usersRepository.save(newUser);

    // 5. GÃ©nÃ©ration du referralCode
    const referralCodeGenerated = await this.generateReferralCode(savedUser.id);
    savedUser.referralCode = referralCodeGenerated;
    await this.usersRepository.save(savedUser);

    // 6. Compte fidÃ©litÃ©
    const loyalty = await this.getOrCreateLoyaltyAccount(savedUser.id);
    await this.loyaltyRepository.save(loyalty);

    // 7. Recharger avec relations
    const fullUser = await this.usersRepository
      .createQueryBuilder('users')
      .addSelect('users.password')
      .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('company.companyResources', 'companyResources')
      .leftJoinAndSelect('companyResources.resource', 'resource')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
      .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
      .leftJoinAndSelect('userPlatformRoles.role', 'role')
      .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .leftJoinAndSelect('users.activeBranch', 'activeBranch')
      .leftJoinAndSelect('activeBranch.country', 'activeBranchCountry')
      .leftJoinAndSelect('activeBranch.city', 'activeBranchCity')
      .leftJoinAndSelect('users.loyalty', 'loyalty')
      .where('users.id = :id', { id: savedUser.id })
      .getOne();

    if (!fullUser)
      throw new NotFoundException(
        await this.i18n.translate('user.user_not_found', lang),
      );

    const { password: _pw, ...userWithoutPassword } = fullUser;

    // 8. Mapper userHasCompany
    const userHasCompany = (userWithoutPassword.userHasCompany || []).map(
      (uhc) => ({
        id: uhc.id,
        isOwner: uhc.isOwner,
        company: uhc.company
          ? {
            ...uhc.company,
            tauxCompanies: uhc.company.tauxCompanies ?? [],
            country: uhc.company.country ?? null,
            city: uhc.company.city ?? null,
            category: uhc.company.category ?? null,
            branches: (uhc.company.branches || []).map((b) => ({
              id: b.id,
              name: b.name,
              address: b.address,
              phone: b.phone,
              email: b.email,
              status: b.status,
              deleted: b.deleted,
              country: b.country
                ? { id: b.country.id, name: b.country.name }
                : null,
              city: b.city ? { id: b.city.id, name: b.city.name } : null,
            })),
          }
          : null,
        branch: uhc.branch
          ? { id: uhc.branch.id, name: uhc.branch.name }
          : null,
        userResources: (uhc.resources || []).map((r) => ({
          id: r.id,
          canCreate: r.canCreate,
          canRead: r.canRead,
          canUpdate: r.canUpdate,
          canDelete: r.canDelete,
          canManage: r.canManage,
          status: r.status,
          resource: r.resource
            ? {
              id: r.resource.id,
              name: r.resource.name,
              label: r.resource.label,
            }
            : null,
        })),
      }),
    );

    // 9. RÃ©ponse
    return {
      message: await this.i18n.translate('user.user_created_by_admin', lang, {
        fullName: fullUser.fullName,
      }),
      data: instanceToPlain({
        ...userWithoutPassword,
        userHasCompany,
        loyalty: {
          points: fullUser.loyalty?.[0]?.pointsBalance ?? 0,
          tier: fullUser.loyalty?.[0]?.currentTier ?? null,
          code: fullUser.loyalty?.[0]?.loyaltyCode ?? null,
        },
        ...(usedDefaultPassword && {
          defaultPasswordUsed: true,
          defaultPasswordHint:
            'Un mot de passe par dÃ©faut a Ã©tÃ© attribuÃ©.',
        }),
      }),
    };
  }

  // ============================================================
  // ðŸ”§ MODIFIER UN UTILISATEUR PAR UN ADMIN
  // ============================================================
  async updateUserByAdmin(
    targetUserId: string,
    dto: UpdateUserByAdminDto,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: any }> {
    // 1. RÃ©cupÃ©rer l'utilisateur cible
    const targetUser = await this.usersRepository.findOne({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException(
        await this.i18n.translate('user.user_not_found', lang),
      );
    }

    // 2. SÃ©curitÃ©
    if (
      targetUser.role === UserRole.SUPER_ADMIN &&
      currentUser.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        await this.i18n.translate('user.cannot_modify_super_admin', lang),
      );
    }

    if (
      dto.role === UserRole.SUPER_ADMIN &&
      currentUser.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        await this.i18n.translate('user.cannot_promote_super_admin', lang),
      );
    }

    if (targetUser.id === currentUser.id && dto.isActive === false) {
      throw new BadRequestException(
        await this.i18n.translate('user.cannot_deactivate_self', lang),
      );
    }

    // 3. Doublons email / phone
    if (dto.email && dto.email !== targetUser.email) {
      const emailExists = await this.usersRepository.findOne({
        where: { email: dto.email },
      });
      if (emailExists && emailExists.id !== targetUserId) {
        throw new BadRequestException(
          await this.i18n.translate('user.email_already_exists', lang),
        );
      }
    }

    if (dto.phone && dto.phone !== targetUser.phone) {
      const phoneExists = await this.usersRepository.findOne({
        where: { phone: dto.phone },
      });
      if (phoneExists && phoneExists.id !== targetUserId) {
        throw new BadRequestException(
          await this.i18n.translate('user.phone_already_exists', lang),
        );
      }
    }

    // 4. Mot de passe (hash si fourni)
    let hashedPassword: string | undefined;
    let passwordChanged = false;

    if (dto.password && dto.password.trim() !== '') {
      hashedPassword = await bcrypt.hash(dto.password, 10);
      passwordChanged = true;
    }

    // 5. Appliquer les modifications
    const oldRole = targetUser.role;

    Object.assign(targetUser, {
      ...(dto.fullName !== undefined && { fullName: dto.fullName }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(hashedPassword !== undefined && { password: hashedPassword }),
      ...(dto.country !== undefined && { country: dto.country }),
      ...(dto.city !== undefined && { city: dto.city }),
      ...(dto.address !== undefined && { address: dto.address }),
      ...(dto.image !== undefined && { image: dto.image }),
      ...(dto.preferredLanguage !== undefined && {
        preferredLanguage: dto.preferredLanguage,
      }),
      ...(dto.role !== undefined && { role: dto.role }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.vehicleType !== undefined && { vehicleType: dto.vehicleType }),
      ...(dto.plateNumber !== undefined && { plateNumber: dto.plateNumber }),
      ...(dto.licenseDocumentUrl !== undefined && {
        licenseDocumentUrl: dto.licenseDocumentUrl,
      }),
    });

    await this.usersRepository.save(targetUser);

    // 6. Recharger avec relations
    const fullUser = await this.usersRepository
      .createQueryBuilder('users')
      .addSelect('users.password')
      .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('company.companyResources', 'companyResources')
      .leftJoinAndSelect('companyResources.resource', 'resource')
      .leftJoinAndSelect('company.branches', 'branches')
      .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
      .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
      .leftJoinAndSelect('userPlatformRoles.role', 'role')
      .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .leftJoinAndSelect('users.activeBranch', 'activeBranch')
      .leftJoinAndSelect('activeBranch.country', 'activeBranchCountry')
      .leftJoinAndSelect('activeBranch.city', 'activeBranchCity')
      .leftJoinAndSelect('users.loyalty', 'loyalty')
      .where('users.id = :id', { id: targetUserId })
      .getOne();

    if (!fullUser)
      throw new NotFoundException(
        await this.i18n.translate('user.user_not_found', lang),
      );

    const { password: _pw, ...userWithoutPassword } = fullUser;

    // 7. Mapper userHasCompany
    const userHasCompany = (userWithoutPassword.userHasCompany || []).map(
      (uhc) => ({
        id: uhc.id,
        isOwner: uhc.isOwner,
        company: uhc.company
          ? {
            ...uhc.company,
            tauxCompanies: uhc.company.tauxCompanies ?? [],
            country: uhc.company.country ?? null,
            city: uhc.company.city ?? null,
            category: uhc.company.category ?? null,
            branches: (uhc.company.branches || []).map((b) => ({
              id: b.id,
              name: b.name,
              address: b.address,
              phone: b.phone,
              email: b.email,
              status: b.status,
              deleted: b.deleted,
              country: b.country
                ? { id: b.country.id, name: b.country.name }
                : null,
              city: b.city ? { id: b.city.id, name: b.city.name } : null,
            })),
          }
          : null,
        branch: uhc.branch
          ? { id: uhc.branch.id, name: uhc.branch.name }
          : null,
        userResources: (uhc.resources || []).map((r) => ({
          id: r.id,
          canCreate: r.canCreate,
          canRead: r.canRead,
          canUpdate: r.canUpdate,
          canDelete: r.canDelete,
          canManage: r.canManage,
          status: r.status,
          resource: r.resource
            ? {
              id: r.resource.id,
              name: r.resource.name,
              label: r.resource.label,
            }
            : null,
        })),
      }),
    );

    // 8. RÃ©ponse
    return {
      message: await this.i18n.translate('user.user_updated_by_admin', lang, {
        fullName: fullUser.fullName,
      }),
      data: instanceToPlain({
        ...userWithoutPassword,
        userHasCompany,
        loyalty: {
          points: fullUser.loyalty?.[0]?.pointsBalance ?? 0,
          tier: fullUser.loyalty?.[0]?.currentTier ?? null,
          code: fullUser.loyalty?.[0]?.loyaltyCode ?? null,
        },
        ...(oldRole !== fullUser.role && {
          oldRole,
          newRole: fullUser.role,
        }),
        ...(passwordChanged && { passwordChanged: true }),
      }),
    };
  }
}