/* eslint-disable prefer-const */
import { ConfigService } from '@nestjs/config';
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
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
  ) { }

  private async generateReferralCode(
    userId: string,
    existingCodes?: string[],
  ): Promise<string> {
    const userIdShort = userId.substring(0, 4).toUpperCase();

    // ✅ Générer un code aléatoire
    let code: string;
    let exists = true;
    let attempts = 0;
    const maxAttempts = 10;

    // ✅ Liste des codes à vérifier
    const codesToCheck = existingCodes || [];

    do {
      // Générer une partie aléatoire
      const random = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase()
        .padStart(6, '0');

      code = `${userIdShort}${random}`; // ✅ Sans REF et sans tirets

      // Vérifier si le code existe déjà
      const existingUser = await this.usersRepository.findOne({
        where: { referralCode: code },
      });

      exists = !!existingUser || codesToCheck.includes(code);
      attempts++;

    } while (exists && attempts < maxAttempts);

    // ✅ Fallback si jamais collision après 10 tentatives
    if (exists) {
      const timestamp = Date.now().toString(36).toUpperCase();
      const randomSuffix = Math.random()
        .toString(36)
        .substring(2, 4)
        .toUpperCase();
      code = `${timestamp.slice(-6)}${randomSuffix}`; // ✅ Sans REF et sans tirets

      // Vérifier une dernière fois le fallback
      const existingUser = await this.usersRepository.findOne({
        where: { referralCode: code },
      });

      if (existingUser) {
        // Fallback ultime avec UUID
        const uuidPart = uuidv4().substring(0, 8).toUpperCase();
        code = `${uuidPart}`; // ✅ Sans REF et sans tirets
      }
    }

    return code;
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
    // ✅ VÉRIFICATION DU CODE DE PARRAINAGE
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
    // 1️⃣ Vérification doublons
    // ============================================================
    const userExists = await this.usersRepository.findOne({
      where: [{ email: email || undefined }, { phone: phone || undefined }],
    });

    if (userExists) {
      throw new BadRequestException(
        await this.i18n.translate('user.account_exists', lang),
      );
    }

    // ============================================================
    // 2️⃣ Envoi OTP si non fourni
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
    // 3️⃣ Vérification OTP
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
    // 4️⃣ CRÉATION UTILISATEUR - SANS referralCode
    // ============================================================
    const hashedPassword = password
      ? await bcrypt.hash(password, 10)
      : undefined;

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
    });

    const savedUser = await this.usersRepository.save(newUser);

    // ============================================================
    // 🔥 GÉNÉRATION DU CODE DE PARRAINAGE POUR LE NOUVEL UTILISATEUR
    // ============================================================
    const referralCodeGenerated = await this.generateReferralCode(savedUser.id);
    savedUser.referralCode = referralCodeGenerated;
    await this.usersRepository.save(savedUser);

    // ============================================================
    // ✅ TRAITEMENT DU PARRAINAGE (si un code a été fourni) - SANS POINTS
    // ============================================================
    if (referralCode && referrer) {
      if (referrer.id === savedUser.id) {
        throw new BadRequestException(
          await this.i18n.translate('referral.self_referral_not_allowed', lang)
        );
      }

      // ✅ Mettre à jour le parrain (UNIQUEMENT le compteur, PAS DE POINTS)
      referrer.referralCount = (referrer.referralCount || 0) + 1;
      referrer.lastReferralDate = new Date();
      await this.usersRepository.save(referrer);

      // ✅ Lier le nouvel utilisateur au parrain
      savedUser.referredBy = referrer.id;
      await this.usersRepository.save(savedUser);

      // ✅ Créer l'historique de parrainage avec rewardAmount = 0
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

    // ✅ Sauvegarder l'utilisateur avec son propre code
    await this.usersRepository.save(savedUser);

    // ============================================================
    // 5️⃣ CRÉATION DU COMPTE FIDÉLITÉ
    // ============================================================
    const generateUniqueLoyaltyCode = async (): Promise<string> => {
      let code: string;
      let exists: UserLoyaltyEntity | null = null;
      let attempts = 0;
      const maxAttempts = 10;

      do {
        code = Math.floor(10000000 + Math.random() * 90000000).toString();
        exists = await this.loyaltyRepository.findOne({
          where: { loyaltyCode: code },
        });
        attempts++;
      } while (exists && attempts < maxAttempts);

      if (exists) {
        const timestamp = Date.now().toString().slice(-8);
        code = timestamp;
      }

      return code;
    };

    const loyaltyCode = await generateUniqueLoyaltyCode();

    const loyalty = this.loyaltyRepository.create({
      userId: savedUser.id,
      loyaltyCode: loyaltyCode,
      pointsBalance: 0,
      pointsTotalEarned: 0,
      pointsTotalSpent: 0,
      currentTier: LoyaltyTier.BRONZE,
      isActive: true,
    });
    await this.loyaltyRepository.save(loyalty);

    // ============================================================
    // 6️⃣ GESTION DU FCM TOKEN
    // ============================================================
    let savedFcmToken: string | undefined;
    if (clientFcmToken && platform) {
      const existingToken = await this.deviceTokenRepo.findOne({
        where: { token: clientFcmToken },
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
    // 7️⃣ MARQUER L'OTP COMME UTILISÉ
    // ============================================================
    otpEntry.isUsed = true;
    otpEntry.user = savedUser;
    await this.otpRepository.save(otpEntry);

    // ============================================================
    // 8️⃣ RECHARGER L'UTILISATEUR AVEC SES RELATIONS
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
    // 9️⃣ ENVOI EMAIL DE BIENVENUE
    // ============================================================
    if (email && email !== '' && validator.isEmail(email)) {
      const userData = {
        fullName: userWithoutPassword.fullName || userWithoutPassword.email || 'Utilisateur',
        email: userWithoutPassword.email || 'Non renseigné',
        phone: userWithoutPassword.phone || 'Non renseigné',
        role: userWithoutPassword.role || 'Client',
        loyaltyCode: loyaltyCode,
        referralCode: savedUser.referralCode,
        createdAt: userWithoutPassword.createdAt
          ? new Date(
            typeof userWithoutPassword.createdAt === 'string'
              ? userWithoutPassword.createdAt
              : (userWithoutPassword.createdAt as any).toDate?.() || userWithoutPassword.createdAt
          ).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
          : "Aujourd'hui",
      };

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
        }
      );
    }

    // ============================================================
    // 🔟 GÉNÉRATION DES TOKENS
    // ============================================================
    const access_token = await this.accessToken(savedUser);
    const refresh_token = await this.refreshToken(savedUser);

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
    console.log('🔍 Langue reçue dans signin :', lang);
    const { fcmToken, platform } = userSignInDto;

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

    const isPasswordValid = await bcrypt.compare(
      userSignInDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new BadRequestException(
        await this.i18n.translate('user.password_incorrect', lang),
      );
    }

    // ✅ Vérifier si l'utilisateur a un compte de fidélité, sinon le créer
    if (!user.loyalty || user.loyalty.length === 0) {
      const generateUniqueLoyaltyCode = async (): Promise<string> => {
        let code: string;
        let exists: UserLoyaltyEntity | null = null;
        let attempts = 0;
        const maxAttempts = 10;
        do {
          code = Math.floor(10000000 + Math.random() * 90000000).toString();
          exists = await this.loyaltyRepository.findOne({
            where: { loyaltyCode: code },
          });
          attempts++;
        } while (exists && attempts < maxAttempts);
        if (exists) {
          const timestamp = Date.now().toString().slice(-8);
          code = timestamp;
        }
        return code;
      };

      const loyaltyCode = await generateUniqueLoyaltyCode();

      const loyalty = this.loyaltyRepository.create({
        userId: user.id,
        loyaltyCode: loyaltyCode,
        pointsBalance: 0,
        pointsTotalEarned: 0,
        pointsTotalSpent: 0,
        currentTier: LoyaltyTier.BRONZE,
        isActive: true,
      });
      await this.loyaltyRepository.save(loyalty);

      const reloadedUser = await this.usersRepository
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
        .where('users.id = :id', { id: user.id })
        .getOne();

      if (reloadedUser) {
        user = reloadedUser;
      }
    }

    const access_token = await this.accessToken(user);
    const refresh_token = await this.refreshToken(user);

    const { password, ...userWithoutPassword } = user;

    if (fcmToken && platform) {
      const existingToken = await this.deviceTokenRepo.findOne({
        where: { token: fcmToken },
      });

      if (existingToken) {
        await this.deviceTokenRepo.update(
          { token: fcmToken },
          {
            userId: user.id,
            platform,
            updatedAt: new Date(),
          },
        );
      } else {
        await this.deviceTokenRepo.save(
          this.deviceTokenRepo.create({
            token: fcmToken,
            userId: user.id,
            platform,
          }),
        );
      }
    }

    const loyaltyPoints = user.loyalty?.[0]?.pointsBalance ?? 0;
    const loyaltyTier = user.loyalty?.[0]?.currentTier ?? null;
    const loyaltyCode = user.loyalty?.[0]?.loyaltyCode ?? null;

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

    const activeCompanyRaw = await this.usersRepository
      .createQueryBuilder('users')
      .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('company.companyResources', 'companyResources')
      .leftJoinAndSelect('companyResources.resource', 'resource')
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .leftJoinAndSelect('company.branches', 'branches')
      .where('users.id = :id', { id: user.id })
      .getOne();

    const activeUserHasCompany = activeCompanyRaw?.userHasCompany?.find(
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

    // ✅ Ajout des informations de parrainage
    const referralData = {
      referralCode: user.referralCode,
      referralCount: user.referralCount || 0,
      referralPoints: user.referralPoints || 0,
      referredBy: user.referredBy,
      referrerName: user.referrer?.fullName || null,
      referralActive: user.referralActive !== false,
      totalReferrals: user.referrals?.length || 0
    };

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
      if (user.provider !== 'google' && user.password) {
        throw new BadRequestException(
          await this.i18n.translate('user.account_with_password_exists', lang),
        );
      }
      if (user.provider !== 'google') {
        await this.usersRepository.update(user.id, { provider: 'google' });
      }
    } else {
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

      // ✅ Générer le code de parrainage
      const referralCodeGenerated = await this.generateReferralCode(user.id);
      user.referralCode = referralCodeGenerated;
      await this.usersRepository.save(user);

      // ✅ Création du compte fidélité
      const generateUniqueLoyaltyCode = async (): Promise<string> => {
        let code: string;
        let exists: UserLoyaltyEntity | null = null;
        let attempts = 0;
        const maxAttempts = 10;
        do {
          code = Math.floor(10000000 + Math.random() * 90000000).toString();
          exists = await this.loyaltyRepository.findOne({
            where: { loyaltyCode: code },
          });
          attempts++;
        } while (exists && attempts < maxAttempts);
        if (exists) {
          const timestamp = Date.now().toString().slice(-8);
          code = timestamp;
        }
        return code;
      };

      const loyaltyCode = await generateUniqueLoyaltyCode();

      const loyalty = this.loyaltyRepository.create({
        userId: user.id,
        loyaltyCode: loyaltyCode,
        pointsBalance: 0,
        pointsTotalEarned: 0,
        pointsTotalSpent: 0,
        currentTier: LoyaltyTier.BRONZE,
        isActive: true,
      });
      await this.loyaltyRepository.save(loyalty);

      await this.mailService.sendHtmlEmail(
        email,
        await this.i18n.translate('user.welcome_subject', lang),
        'createCount.html',
        { userWithoutPassword: user, year: new Date().getFullYear() },
      );

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

    // Définir automatiquement la première compagnie comme active
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
        const reloaded = await this.usersRepository
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
          .leftJoinAndSelect('users.referrals', 'referrals')
          .leftJoinAndSelect('users.referrer', 'referrer')
          .where('users.id = :id', { id: user.id })
          .getOne();
        if (reloaded) user = reloaded;
      }
    }

    if (fcmToken && platform) {
      const existingToken = await this.deviceTokenRepo.findOne({
        where: { token: fcmToken },
      });
      if (existingToken) {
        await this.deviceTokenRepo.update(
          { token: fcmToken },
          { userId: user.id, platform, updatedAt: new Date() },
        );
      } else {
        await this.deviceTokenRepo.save(
          this.deviceTokenRepo.create({
            token: fcmToken,
            userId: user.id,
            platform,
          }),
        );
      }
    }

    const access_token = await this.accessToken(user);
    const refresh_token = await this.refreshToken(user);

    const { password, ...userWithoutPassword } = user;

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

    const activeCompanyRaw = await this.usersRepository
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
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .leftJoinAndSelect('company.branches', 'branches')
      .where('users.id = :id', { id: user.id })
      .getOne();

    const activeUserHasCompany = activeCompanyRaw?.userHasCompany?.find(
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

    // ✅ Ajout des informations de parrainage
    const referralData = {
      referralCode: user.referralCode,
      referralCount: user.referralCount || 0,
      referralPoints: user.referralPoints || 0,
      referredBy: user.referredBy,
      referrerName: user.referrer?.fullName || null,
      referralActive: user.referralActive !== false,
      totalReferrals: user.referrals?.length || 0
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
  // ==================== APPLE LOGIN ====================
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

    if (!user && email) {
      const existingUserByEmail = await this.usersRepository.findOne({
        where: { email },
      });
      if (existingUserByEmail) {
        throw new BadRequestException(
          await this.i18n.translate('user.email_already_exists', lang),
        );
      }
    }

    if (!user) {
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

      // ✅ Générer le code de parrainage
      const referralCodeGenerated = await this.generateReferralCode(user.id);
      user.referralCode = referralCodeGenerated;
      await this.usersRepository.save(user);

      // ✅ Création du compte fidélité
      const generateUniqueLoyaltyCode = async (): Promise<string> => {
        let code: string;
        let exists: UserLoyaltyEntity | null = null;
        let attempts = 0;
        const maxAttempts = 10;
        do {
          code = Math.floor(10000000 + Math.random() * 90000000).toString();
          exists = await this.loyaltyRepository.findOne({
            where: { loyaltyCode: code },
          });
          attempts++;
        } while (exists && attempts < maxAttempts);
        if (exists) {
          const timestamp = Date.now().toString().slice(-8);
          code = timestamp;
        }
        return code;
      };

      const loyaltyCode = await generateUniqueLoyaltyCode();

      const loyalty = this.loyaltyRepository.create({
        userId: user.id,
        loyaltyCode: loyaltyCode,
        pointsBalance: 0,
        pointsTotalEarned: 0,
        pointsTotalSpent: 0,
        currentTier: LoyaltyTier.BRONZE,
        isActive: true,
      });
      await this.loyaltyRepository.save(loyalty);

      if (user.email) {
        await this.mailService.sendHtmlEmail(
          user.email,
          await this.i18n.translate('user.welcome_subject', lang),
          'createCount.html',
          { userWithoutPassword: user, year: new Date().getFullYear() },
        );
      }

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
      if (user.provider !== 'APPLE') {
        throw new BadRequestException(
          await this.i18n.translate('user.apple_account_not_linked', lang, {
            provider: user.provider,
          }),
        );
      }
      let shouldUpdate = false;
      if (fullName && fullName !== user.fullName) {
        user.fullName = fullName;
        shouldUpdate = true;
      }
      if (email && email !== user.email) {
        const existingUserByEmail = await this.usersRepository.findOne({
          where: { email },
        });
        if (existingUserByEmail)
          throw new BadRequestException(
            await this.i18n.translate('user.email_already_exists', lang),
          );
        user.email = email;
        shouldUpdate = true;
      }
      if (shouldUpdate) {
        user = await this.usersRepository.save(user);
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
    }

    if (!user)
      throw new InternalServerErrorException(
        await this.i18n.translate('user.user_not_found', lang),
      );

    if (fcmToken && platform) {
      const existingToken = await this.deviceTokenRepo.findOne({
        where: { token: fcmToken },
      });
      if (existingToken) {
        await this.deviceTokenRepo.update(
          { token: fcmToken },
          { userId: user.id, platform, updatedAt: new Date() },
        );
      } else {
        await this.deviceTokenRepo.save(
          this.deviceTokenRepo.create({
            token: fcmToken,
            userId: user.id,
            platform,
          }),
        );
      }
    }

    const access_token = await this.accessToken(user);
    const refresh_token = await this.refreshToken(user);

    const { password, ...userWithoutPassword } = user;

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

    const activeCompanyRaw = await this.usersRepository
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
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .leftJoinAndSelect('company.branches', 'branches')
      .where('users.id = :id', { id: user.id })
      .getOne();

    const activeUserHasCompany = activeCompanyRaw?.userHasCompany?.find(
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

    // ✅ Ajout des informations de parrainage
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

      const access_token = await this.accessToken(fullUser);
      const refresh_token = await this.refreshToken(fullUser);

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

      const activeCompanyRaw = await this.usersRepository
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
        .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
        .leftJoinAndSelect(
          'userCompanyResources.resource',
          'userCompanyResourceDetail',
        )
        .leftJoinAndSelect('company.branches', 'branches')
        .where('users.id = :id', { id: fullUser.id })
        .getOne();

      const activeUserHasCompany = activeCompanyRaw?.userHasCompany?.find(
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
      console.error('Erreur lors de la mise à jour de l’utilisateur:', error);
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
        console.warn('⚠️ Échec suppression ancienne image :', err.message);
      }
    }

    const uploadedFile = await this.filesService.uploadFile(
      file,
      'user',
      'avatar',
    );
    user.image = uploadedFile.data;
    const updatedUser = await this.usersRepository.save(user);

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
      .where('users.id = :id', { id: userId })
      .getOne();

    if (!fullUser)
      throw new NotFoundException(
        await this.i18n.translate('user.user_not_found', lang),
      );

    const { password, ...userWithoutPassword } = fullUser;

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

    const activeCompanyRaw = await this.usersRepository
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
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .leftJoinAndSelect('company.branches', 'branches')
      .where('users.id = :id', { id: fullUser.id })
      .getOne();

    const activeUserHasCompany = activeCompanyRaw?.userHasCompany?.find(
      (uhc) => uhc.company?.id === fullUser.activeCompanyId,
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

    let totalPoints = 0;
    const rewardsByCurrency: Record<string, number> = {};

    // ✅ Historique des parrainages
    const history = user.referralHistory?.map((referral) => {
      const referred = referral.referred;
      let rewardAmount = 0;
      let orderDetails: any[] = [];
      let validatedOrdersLength = 0;
      // ✅ Utiliser la devise du parrainage
      let rewardCurrency = referral.currency || 'USD';

      if (referred && referred.orders && referred.orders.length > 0) {
        const validatedOrders = referred.orders.filter(
          (order) => order.status === OrderStatus.VALIDATED
        );
        validatedOrdersLength = validatedOrders.length;

        // ✅ Regrouper les commandes par devise
        const ordersByCurrency: Record<string, any[]> = {};
        validatedOrders.forEach(order => {
          const currency = order.currency || 'USD';
          if (!ordersByCurrency[currency]) {
            ordersByCurrency[currency] = [];
          }
          ordersByCurrency[currency].push(order);
        });

        // ✅ Calculer les récompenses par devise
        Object.entries(ordersByCurrency).forEach(([currency, orders]) => {
          const totalShippingCost = orders.reduce(
            (sum, order) => sum + Number(order.shippingCost || 0),
            0
          );
          const reward = totalShippingCost * 0.10;

          // ✅ Ajouter les détails des commandes
          orders.forEach(order => {
            orderDetails.push({
              orderId: order.id,
              shippingCost: order.shippingCost || 0,
              currency: currency,
              reward: (Number(order.shippingCost || 0) * 0.10),
              rewardCurrency: currency,
              createdAt: order.createdAt,
              status: order.status,
            });
          });

          // ✅ Ajouter au total par devise
          if (reward > 0) {
            if (!rewardsByCurrency[currency]) {
              rewardsByCurrency[currency] = 0;
            }
            rewardsByCurrency[currency] += reward;

            // ✅ Si la devise correspond à celle du parrainage, l'ajouter au total
            if (currency === rewardCurrency) {
              rewardAmount += reward;
            }
          }
        });
      }

      return {
        id: referral.id,
        referredUser: referred?.fullName || 'Utilisateur inconnu',
        referredEmail: referred?.email || 'Non renseigné',
        referredPhone: referred?.phone || 'Non renseigné',
        referredId: referred?.id || null,
        status: referral.status,
        rewardAmount: Math.round(rewardAmount * 100) / 100,
        rewardCurrency: rewardCurrency, // ✅ Devise du parrainage
        rewardType: 'POINTS (10% shipping - VALIDATED)',
        createdAt: referral.createdAt,
        completedAt: referral.completedAt || null,
        orders: orderDetails,
        totalValidatedOrders: validatedOrdersLength,
        referralCurrency: referral.currency || 'USD',
      };
    }) || [];

    // ✅ Mettre à jour les points (total par devise)
    let totalPointsAllCurrencies = 0;
    Object.values(rewardsByCurrency).forEach(amount => {
      totalPointsAllCurrencies += amount;
    });

    if (Math.round(totalPointsAllCurrencies * 100) / 100 !== user.referralPoints) {
      user.referralPoints = Math.round(totalPointsAllCurrencies * 100) / 100;
      await this.usersRepository.save(user);
    }

    // ✅ Liste des utilisateurs parrainés
    const referredUsers = user.referralHistory?.map((referral) => {
      const referred = referral.referred;
      const validatedOrders = referred?.orders?.filter(
        (order) => order.status === OrderStatus.VALIDATED
      ) || [];

      // ✅ Regrouper par devise
      const ordersByCurrency: Record<string, any[]> = {};
      validatedOrders.forEach(order => {
        const currency = order.currency || 'USD';
        if (!ordersByCurrency[currency]) {
          ordersByCurrency[currency] = [];
        }
        ordersByCurrency[currency].push(order);
      });

      // ✅ Calculer les totaux par devise
      const result = {
        id: referred?.id || null,
        fullName: referred?.fullName || 'Utilisateur inconnu',
        email: referred?.email || null,
        phone: referred?.phone || null,
        status: referral.status,
        totalOrders: referred?.orders?.length || 0,
        totalValidatedOrders: validatedOrders.length,
        totalShippingCost: 0,
        currency: 'USD',
        pointsEarned: 0,
        pointsCurrency: 'USD',
        createdAt: referral.createdAt,
        completedAt: referral.completedAt || null,
        breakdown: [] as { currency: string; shippingCost: number; pointsEarned: number }[],
      };

      // ✅ Calculer par devise
      Object.entries(ordersByCurrency).forEach(([currency, orders]) => {
        const totalShipping = orders.reduce(
          (sum, order) => sum + Number(order.shippingCost || 0),
          0
        );
        const points = totalShipping * 0.10;

        result.breakdown.push({
          currency: currency,
          shippingCost: Math.round(totalShipping * 100) / 100,
          pointsEarned: Math.round(points * 100) / 100,
        });

        // ✅ Si c'est la première devise ou la devise principale
        if (!result.currency || currency === 'USD') {
          result.totalShippingCost += totalShipping;
          result.pointsEarned += points;
        }
      });

      // ✅ Arrondir les valeurs
      result.totalShippingCost = Math.round(result.totalShippingCost * 100) / 100;
      result.pointsEarned = Math.round(result.pointsEarned * 100) / 100;

      return result;
    }) || [];

    // ✅ Construire les récompenses par devise
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
        referralPoints: Math.round(totalPointsAllCurrencies * 100) / 100,
        totalReferralRewards: Math.round(totalPointsAllCurrencies * 100) / 100,
        referralCount: user.referralCount || 0,
        referralCode: user.referralCode || 'Non généré',
        referralLink: referralLink || 'Non disponible',
        referralActive: user.referralActive !== false,
        rewardsByCurrency: rewardsByCurrencyArray, // ✅ Récompenses par devise
        defaultCurrency: 'USD',
        history,
        referredUsers,
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

    // Supprimer l'ancien OTP non utilisé
    const existingOtp = await this.otpRepository.findOne({
      where: { email, isUsed: false },
    });
    if (existingOtp) await this.otpRepository.remove(existingOtp);

    // Créer le nouvel OTP
    const otp = this.otpRepository.create({
      email,
      otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await this.otpRepository.save(otp);

    // Envoi par email ou SMS
    if (validator.isEmail(email)) {
      // Récupération des traductions pour l'email
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
      // ✅ Construire l'objet translations (identique à sendOtp)
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
          translations,   // ✅ nécessaire pour le template
          lang,           // ✅ nécessaire pour l'attribut lang du HTML
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
      .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
      .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
      .leftJoinAndSelect('userPlatformRoles.role', 'role')
      .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
      .leftJoinAndSelect('defaultAddress.country', 'defaultAddressCountry')  // ✅ Ajout du pays
      .leftJoinAndSelect('defaultAddress.city', 'defaultAddressCity')        // ✅ Ajout de la ville
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

    // ✅ Vérifier si l'utilisateur a un compte de fidélité, sinon le créer
    if (!user.loyalty || user.loyalty.length === 0) {
      const generateUniqueLoyaltyCode = async (): Promise<string> => {
        let code: string;
        let exists: UserLoyaltyEntity | null = null;
        let attempts = 0;
        const maxAttempts = 10;
        do {
          code = Math.floor(10000000 + Math.random() * 90000000).toString();
          exists = await this.loyaltyRepository.findOne({
            where: { loyaltyCode: code },
          });
          attempts++;
        } while (exists && attempts < maxAttempts);
        if (exists) {
          const timestamp = Date.now().toString().slice(-8);
          code = timestamp;
        }
        return code;
      };

      const loyaltyCode = await generateUniqueLoyaltyCode();

      const loyalty = this.loyaltyRepository.create({
        userId: user.id,
        loyaltyCode: loyaltyCode,
        pointsBalance: 0,
        pointsTotalEarned: 0,
        pointsTotalSpent: 0,
        currentTier: LoyaltyTier.BRONZE,
        isActive: true,
      });
      await this.loyaltyRepository.save(loyalty);

      const reloadedUser = await this.usersRepository
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

      if (reloadedUser) {
        user = reloadedUser;
      }
    }

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

    const activeCompanyRaw = await this.usersRepository
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
      .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
      .leftJoinAndSelect(
        'userCompanyResources.resource',
        'userCompanyResourceDetail',
      )
      .leftJoinAndSelect('company.branches', 'branches')
      .where('users.id = :id', { id: userId })
      .getOne();

    const activeUserHasCompany = activeCompanyRaw?.userHasCompany?.find(
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

    // ✅ defaultAddress avec country et city
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

    // ✅ Ajout des informations de parrainage
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
  async findAllWithDetails() {
    const users = await this.usersRepository
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
      .orderBy('users.createdAt', 'DESC')
      .getMany();

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
      });
    });

    return sanitizedUsers;
  }

  async findOne(id: string, lang: string = 'fr'): Promise<{ data: UserEntity }> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) throw new NotFoundException(await this.i18n.translate('user.user_not_found', lang));
    return { data: user };
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
    // 1️⃣ Récupérer l'utilisateur avec toutes ses relations
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

    // 2️ Basculer automatiquement le statut (true → false, false → true)
    user.isActive = !user.isActive;
    await this.usersRepository.save(user);

    // 3️⃣ Supprimer le mot de passe avant retour
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
}