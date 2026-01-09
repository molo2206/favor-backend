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
import { verifyAppleToken } from './utility/helpers/apple.strategy';
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(OtpEntity)
    private readonly otpRepository: Repository<OtpEntity>,

    @InjectRepository(Resource)
    private readonly resourcesRepository: Repository<Resource>,

    @InjectRepository(UserHasResourceEntity)
    private readonly userHasResourceRepository: Repository<UserHasResourceEntity>,

    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly cloudinary: CloudinaryService,
    private readonly mailService: MailService,
    private readonly smsHelper: SmsHelper,
  ) {}

  async signup(createUserDto: CreateUserDto): Promise<{
    message: string;
    data: Omit<UserEntity, 'password'> | { email?: string; phone?: string };
    access_token: string | null;
    refresh_token: string | null;
  }> {
    const { email, phone, otpCode, password } = createUserDto;

    // ✅ VALIDATION MANUELLE SIMPLE
    const hasEmail = email && email !== '';
    const hasPhone = phone && phone !== '';

    if (!hasEmail && !hasPhone) {
      throw new BadRequestException('Un email ou un numéro de téléphone est requis.');
    }

    if (hasEmail && !validator.isEmail(email)) {
      throw new BadRequestException('Email must be a valid email address');
    }

    if (hasPhone && !validator.isMobilePhone(phone, 'any')) {
      throw new BadRequestException('Phone must be a valid phone number');
    }

    const destination = email || phone;
    if (!destination) {
      throw new BadRequestException('Un email ou un numéro de téléphone est requis.');
    }

    // 1️⃣ Vérification doublons
    const userExists = await this.usersRepository.findOne({
      where: [{ email: email || undefined }, { phone: phone || undefined }],
    });

    if (userExists) {
      throw new BadRequestException('Un compte avec cet email ou numéro existe déjà.');
    }

    // 2️⃣ Envoi OTP si non fourni - AVEC LOGIQUE AMÉLIORÉE
    if (!otpCode) {
      // ✅ APPLIQUER LA LOGIQUE DE sendResetPasswordOtp
      const generatedOtpCode = Math.floor(1000 + Math.random() * 9000).toString();
      const otp = this.otpRepository.create({
        email: destination, // On utilise destination (email ou phone) comme identifiant
        otpCode: generatedOtpCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      });
      await this.otpRepository.save(otp);

      // ✅ ENVOI AUTOMATIQUE SELON LE TYPE (Email ou SMS)
      if (validator.isEmail(destination)) {
        // Envoi par EMAIL
        await this.mailService.sendHtmlEmail(
          destination,
          'Code de vérification - FavorHelp',
          'sendOtp.html',
          { otpCode: generatedOtpCode, year: new Date().getFullYear() },
        );
      } else if (validator.isMobilePhone(destination, 'any')) {
        // Envoi par SMS
        const message = `Votre code de vérification FavorHelp est : ${generatedOtpCode}`;
        const sent = await this.smsHelper.sendSms(destination, message);
        if (!sent) {
          throw new BadRequestException("Impossible d'envoyer le SMS de vérification.");
        }
      }

      return {
        message: validator.isEmail(destination)
          ? 'Un code OTP a été envoyé à votre email.'
          : 'Un code OTP a été envoyé par SMS.',
        data: { ...(email ? { email } : {}), ...(phone ? { phone } : {}) },
        access_token: null,
        refresh_token: null,
      };
    }

    // 3️⃣ Vérification OTP
    const otpEntry = await this.otpRepository.findOne({
      where: { email: destination, otpCode, isUsed: false },
    });
    if (!otpEntry || new Date() > otpEntry.expiresAt) {
      throw new BadRequestException('OTP invalide ou expiré.');
    }

    // 4️⃣ Création utilisateur
    const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;
    const newUser = this.usersRepository.create({
      ...createUserDto,
      email: email || undefined,
      phone: phone || undefined,
      password: hashedPassword,
      role: UserRole.CUSTOMER,
      isActive: true,
      provider: 'otp',
    });

    const savedUser = await this.usersRepository.save(newUser);

    // 5️⃣ Marquer OTP utilisé
    otpEntry.isUsed = true;
    otpEntry.user = savedUser;
    await this.otpRepository.save(otpEntry);

    const userFull = await this.usersRepository.findOne({
      where: { id: savedUser.id },
      relations: [
        'activeCompany',
        'activeCompany.country',
        'activeCompany.city',
        'userHasCompany',
        'userHasCompany.company',
        'userHasCompany.company.tauxCompanies',
        'userHasCompany.permissions',
        'userHasCompany.permissions.permission',
        'userPlatformRoles',
        'userPlatformRoles.platform',
        'userPlatformRoles.role',
      ],
    });
    if (!userFull) throw new NotFoundException("Impossible de récupérer l'utilisateur créé.");

    const { password: _pw, ...userWithoutPassword } = userFull;

    // 6️⃣ Envoyer email de bienvenue si c'est un email
    if (email && email !== '' && validator.isEmail(email)) {
      await this.mailService.sendHtmlEmail(
        email,
        'Bienvenue dans FavorHelp',
        'createCount.html',
        { userWithoutPassword, year: new Date().getFullYear() },
      );
    }

    // 7️⃣ Générer tokens JWT
    const access_token = await this.accessToken(savedUser);
    const refresh_token = await this.refreshToken(savedUser);

    return {
      message: 'Inscription réussie. Bienvenue !',
      data: userWithoutPassword,
      access_token,
      refresh_token,
    };
  }
  async update(
    updateUserDto: Partial<UpdateUserDto>,
    currentUser: UserEntity,
  ): Promise<{ message: string; data: any }> {
    try {
      // 1️⃣ Récupérer l’utilisateur
      const user = await this.usersRepository.findOne({
        where: { id: currentUser.id },
      });
      if (!user) {
        throw new NotFoundException(`Utilisateur avec l'ID ${currentUser.id} non trouvé`);
      }

      // 2️⃣ Appliquer les modifications
      Object.assign(user, updateUserDto);
      await this.usersRepository.save(user);

      // 3️⃣ Récupérer l’utilisateur enrichi avec toutes les relations nécessaires
      const fullUser = await this.usersRepository.findOne({
        where: { id: user.id },
        relations: [
          'activeCompany',
          'activeCompany.country',
          'activeCompany.city',
          'userHasCompany',
          'userHasCompany.company',
          'userHasCompany.company.tauxCompanies',
          'userHasCompany.company.country',
          'userHasCompany.company.city',
          'userHasCompany.permissions',
          'userHasCompany.permissions.permission',
          'userPlatformRoles',
          'userPlatformRoles.platform',
          'userPlatformRoles.role',
        ],
      });

      if (!fullUser) {
        throw new NotFoundException('Utilisateur enrichi introuvable après la mise à jour.');
      }

      // 4️⃣ Sérialisation
      const userHasCompany =
        fullUser.userHasCompany?.map((uhc) => ({
          id: uhc.id,
          isOwner: uhc.isOwner,
          company: uhc.company
            ? {
                id: uhc.company.id,
                companyName: uhc.company.companyName || '',
                logo: uhc.company.logo,
                banner: uhc.company.banner,
                companyAddress: uhc.company.companyAddress || '',
                typeCompany: uhc.company.typeCompany,
                phone: uhc.company.phone,
                vatNumber: uhc.company.vatNumber,
                registrationDocumentUrl: uhc.company.registrationDocumentUrl,
                warehouseLocation: uhc.company.warehouseLocation,
                email: uhc.company.email,
                website: uhc.company.website,
                status: uhc.company.status,
                companyActivity: uhc.company.companyActivity,
                latitude: uhc.company.latitude,
                longitude: uhc.company.longitude,
                address: uhc.company.address,
                tauxCompanies: uhc.company.tauxCompanies || [],
                country: uhc.company.country,
                city: uhc.company.city,
                localCurrency: uhc.company.localCurrency,
                taux: uhc.company.taux,
              }
            : null,
          permissions:
            uhc.permissions?.map((p) => ({
              id: p.permission?.id,
              name: p.permission?.name,
              create: p.create,
              read: p.read,
              update: p.update,
              delete: p.delete,
              status: p.status,
              createdAt:
                p.permission?.createdAt instanceof Date
                  ? p.permission.createdAt
                  : new Date(p.permission?.createdAt),
              updatedAt:
                p.permission?.updatedAt instanceof Date
                  ? p.permission.updatedAt
                  : new Date(p.permission?.updatedAt),
            })) ?? [],
        })) ?? [];

      // 5️⃣ Retour final
      return {
        message: 'Utilisateur mis à jour avec succès.',
        data: {
          id: fullUser.id,
          fullName: fullUser.fullName,
          email: fullUser.email,
          phone: fullUser.phone,
          image: fullUser.image,
          role: fullUser.role,
          isActive: fullUser.isActive,
          country: fullUser.country,
          city: fullUser.city,
          address: fullUser.address,
          preferredLanguage: fullUser.preferredLanguage,
          loyaltyPoints: fullUser.loyaltyPoints,
          dateOfBirth: fullUser.dateOfBirth,
          vehicleType: fullUser.vehicleType,
          plateNumber: fullUser.plateNumber,
          activeCompany: fullUser.activeCompany,
          defaultAddressId: fullUser.defaultAddressId,
          defaultAddress: fullUser.defaultAddress,
          userHasCompany,
          userPlatformRoles:
            fullUser.userPlatformRoles?.map((upr) => ({
              id: upr.id,
              platform: upr.platform,
              role: upr.role,
            })) ?? [],
        },
      };
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l’utilisateur:', error);
      throw new InternalServerErrorException('Une erreur interne est survenue.');
    }
  }

  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const { currentPassword, newPassword } = changePasswordDto;
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'password'],
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException('Mot de passe actuel incorrect');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await this.usersRepository.save(user);

    return { message: 'Mot de passe mis à jour avec succès' };
  }

  async signin(userSignInDto: LoginUserDto): Promise<{
    message: string;
    data: any;
    access_token: string;
    refresh_token: string;
  }> {
    const user = await this.usersRepository
      .createQueryBuilder('users')
      .addSelect('users.password')
      .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.category', 'category')
      .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
      .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
      .leftJoinAndSelect('userPlatformRoles.role', 'role')
      .leftJoinAndSelect('users.userHasResources', 'userHasResources')
      .leftJoinAndSelect('userHasResources.resource', 'resource')
      .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
      .where('users.email = :login OR users.phone = :login', { login: userSignInDto.email })
      .getOne();

    if (!user)
      throw new BadRequestException(
        'Aucun utilisateur trouvé avec cet email ou numéro de téléphone.',
      );

    if (user.deleted) {
      throw new BadRequestException(
        ' Ce compte a été supprimé et ne peut plus se connecter. Pour toute assistance, veuillez contacter l’administrateur à baenisam@gmail.com.',
      );
    }

    if (!user.password)
      throw new BadRequestException('Mot de passe non défini pour ce compte.');

    const isPasswordValid = await bcrypt.compare(userSignInDto.password, user.password);
    if (!isPasswordValid) throw new BadRequestException('Mot de passe incorrect.');

    const access_token = await this.accessToken(user);
    const refresh_token = await this.refreshToken(user);

    const { password, ...userWithoutPassword } = user;

    const userHasCompany =
      userWithoutPassword.userHasCompany?.map((uhc) => ({
        id: uhc.id,
        isOwner: uhc.isOwner,
        company: uhc.company
          ? {
              id: uhc.company.id,
              companyName: uhc.company.companyName || '',
              logo: uhc.company.logo || null,
              banner: uhc.company.banner || null,
              companyAddress: uhc.company.companyAddress || '',
              typeCompany: uhc.company.typeCompany || null,
              phone: uhc.company.phone || '',
              vatNumber: uhc.company.vatNumber || '',
              registrationDocumentUrl: uhc.company.registrationDocumentUrl || null,
              warehouseLocation: uhc.company.warehouseLocation || '',
              email: uhc.company.email || '',
              website: uhc.company.website || '',
              status: uhc.company.status,
              companyActivity: uhc.company.companyActivity || null,
              open_time: uhc.company.open_time,
              delivery_minutes: uhc.company.delivery_minutes,
              distance_km: uhc.company.distance_km,
              latitude: uhc.company.latitude,
              longitude: uhc.company.longitude,
              address: uhc.company.address || '',
              tauxCompanies: uhc.company.tauxCompanies ?? [],
              country: uhc.company.country ?? null,
              city: uhc.company.city ?? null,
              localCurrency: uhc.company.localCurrency ?? null,
              taux: uhc.company.taux ?? null,
              category: (uhc.company as any).category || null, // ✅ Category complet
              categoryId: (uhc.company as any).category?.id || null, // ✅ CategoryId
            }
          : null,
      })) ?? [];

    const activeCompany = userHasCompany.find(
      (uhc) => uhc.company?.id === userWithoutPassword.activeCompanyId,
    )?.company;

    const activeCompanyWithCategory = activeCompany
      ? {
          ...activeCompany,
          category: activeCompany.category || null,
          categoryId: activeCompany.category?.id || null,
        }
      : null;

    const userPlatformRoles =
      userWithoutPassword.userPlatformRoles?.map((upr) => ({
        id: upr.id,
        platform: upr.platform,
        role: upr.role,
        branchUserPlatformRoleResources:
          upr.branchUserPlatformRoleResources?.map((b) => ({
            id: b.id,
            branch: b.branch,
            resource: b.resource,
            create: b.create,
            read: b.read,
            update: b.update,
            delete: b.delete,
            validate: b.validate,
          })) ?? [],
      })) ?? [];

    const userHasResources =
      userWithoutPassword.userHasResources?.map((uhr) => ({
        id: uhr.id,
        create: uhr.create,
        read: uhr.read,
        update: uhr.update,
        delete: uhr.delete,
        validate: uhr.validate,
        resource: uhr.resource
          ? {
              id: uhr.resource.id,
              label: uhr.resource.label,
              value: uhr.resource.value,
              status: uhr.resource.status,
            }
          : null,
      })) ?? [];

    return {
      message: 'Connexion réussie !',
      data: instanceToPlain({
        ...userWithoutPassword,
        userHasCompany,
        activeCompany: activeCompanyWithCategory,
        userPlatformRoles,
        userHasResources,
      }),
      access_token,
      refresh_token,
    };
  }

  async googleLoginByClientData(dto: GoogleLoginDto): Promise<{
    message: string;
    data: any;
    access_token: string;
    refresh_token: string;
  }> {
    const { email, fullName, image } = dto;
    if (!email) throw new BadRequestException("L'email est requis.");

    let user = await this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
      relations: [
        'activeCompany',
        'activeCompany.country',
        'activeCompany.city',
        'activeCompany.category',
        'userHasCompany',
        'userHasCompany.company',
        'userHasCompany.company.tauxCompanies',
        'userHasCompany.company.country',
        'userHasCompany.company.city',
        'userHasCompany.company.category',
        'userPlatformRoles',
        'userPlatformRoles.platform',
        'userPlatformRoles.role',
        'userPlatformRoles.branchUserPlatformRoleResources',
        'userPlatformRoles.branchUserPlatformRoleResources.branch',
        'userPlatformRoles.branchUserPlatformRoleResources.resource',
        'userHasResources',
        'userHasResources.resource',
      ],
    });

    let isNewUser = false;

    if (user) {
      if (user.password && user.provider !== 'google') {
        throw new BadRequestException(
          'Ce compte a été créé avec un mot de passe. Veuillez utiliser la connexion standard.',
        );
      }
      if (!user.provider || user.provider !== 'google') {
        await this.usersRepository.update(user.id, { provider: 'google' });
      }
    } else {
      user = this.usersRepository.create({
        email,
        fullName,
        role: UserRole.CUSTOMER,
        provider: dto.provider || 'google',
        password: '',
        isActive: true,
        image: image || undefined,
        phone: '',
      });
      user = await this.usersRepository.save(user);
      isNewUser = true;

      await this.mailService.sendHtmlEmail(
        email,
        'Inscription confirmée sur FavorHelp',
        'createCount.html',
        { userWithoutPassword: user, year: new Date().getFullYear() },
      );
    }

    const access_token = await this.accessToken(user);
    const refresh_token = await this.refreshToken(user);

    const { password, ...userWithoutPassword } = user;

    // Mapping des entreprises liées
    const userHasCompany =
      userWithoutPassword.userHasCompany?.map((uhc) => ({
        id: uhc.id,
        isOwner: uhc.isOwner,
        company: uhc.company
          ? {
              id: uhc.company.id,
              companyName: uhc.company.companyName || '',
              logo: uhc.company.logo,
              banner: uhc.company.banner,
              companyAddress: uhc.company.companyAddress || '',
              typeCompany: uhc.company.typeCompany,
              phone: uhc.company.phone,
              vatNumber: uhc.company.vatNumber,
              registrationDocumentUrl: uhc.company.registrationDocumentUrl,
              warehouseLocation: uhc.company.warehouseLocation,
              email: uhc.company.email,
              website: uhc.company.website,
              status: uhc.company.status,
              companyActivity: uhc.company.companyActivity,
              open_time: uhc.company.open_time,
              delivery_minutes: uhc.company.delivery_minutes,
              distance_km: uhc.company.distance_km,
              latitude: uhc.company.latitude,
              longitude: uhc.company.longitude,
              address: uhc.company.address,
              tauxCompanies: uhc.company.tauxCompanies || [],
              country: uhc.company.country || null,
              city: uhc.company.city || null,
              localCurrency: uhc.company.localCurrency,
              taux: uhc.company.taux,
              category: (uhc.company as any).category || null, // ✅ Category complet
              categoryId: (uhc.company as any).category?.id || null, // ✅ CategoryId
            }
          : null,
      })) ?? [];

    const activeCompany = userHasCompany.find(
      (uhc) => uhc.company?.id === userWithoutPassword.activeCompanyId,
    )?.company;

    const activeCompanyWithCategory = activeCompany
      ? {
          ...activeCompany,
          category: activeCompany.category || null,
          categoryId: activeCompany.category?.id || null,
        }
      : null;

    // Mapping des rôles sur les plateformes
    const userPlatformRoles =
      userWithoutPassword.userPlatformRoles?.map((upr) => ({
        id: upr.id,
        platform: upr.platform,
        role: upr.role,
        branchUserPlatformRoleResources:
          upr.branchUserPlatformRoleResources?.map((b) => ({
            id: b.id,
            branch: b.branch,
            resource: b.resource,
            create: b.create,
            read: b.read,
            update: b.update,
            delete: b.delete,
            validate: b.validate,
          })) ?? [],
        createdAt: upr.createdAt,
      })) ?? [];

    // Mapping des ressources utilisateurs
    const userHasResources =
      userWithoutPassword.userHasResources?.map((uhr) => ({
        id: uhr.id,
        create: uhr.create,
        read: uhr.read,
        update: uhr.update,
        delete: uhr.delete,
        validate: uhr.validate,
        resource: uhr.resource
          ? {
              id: uhr.resource.id,
              label: uhr.resource.label,
              value: uhr.resource.value,
              status: uhr.resource.status,
            }
          : null,
      })) ?? [];

    const responseUser = {
      ...userWithoutPassword,
      userHasCompany,
      activeCompany: activeCompanyWithCategory,
      userPlatformRoles,
      userHasResources,
    };

    return {
      message: isNewUser
        ? 'Compte créé et connexion réussie via Google.'
        : 'Connexion réussie via Google.',
      data: instanceToPlain(responseUser),
      access_token,
      refresh_token,
    };
  }

  async appleLogin(dto: {
    identityToken: string;
    authorizationCode?: string;
    fullName?: { givenName?: string; familyName?: string };
    email?: string;
  }) {
    const decoded: any = await verifyAppleToken(dto.identityToken);
    if (!decoded?.sub) {
      throw new BadRequestException('Apple Sign-In failed');
    }

    const appleUserId = decoded.sub;
    const emailFromToken = decoded.email;
    const fullName = dto.fullName
      ? `${dto.fullName.givenName ?? ''} ${dto.fullName.familyName ?? ''}`.trim()
      : 'Utilisateur Apple';

    let user = await this.usersRepository.findOne({
      where: { appleUserId },
      relations: [
        'activeCompany',
        'activeCompany.country',
        'activeCompany.city',
        'activeCompany.category',
        'userHasCompany',
        'userHasCompany.company',
        'userHasCompany.company.tauxCompanies',
        'userHasCompany.company.country',
        'userHasCompany.company.city',
        'userHasCompany.company.category',
        'userPlatformRoles',
        'userPlatformRoles.platform',
        'userPlatformRoles.role',
        'userPlatformRoles.branchUserPlatformRoleResources',
        'userPlatformRoles.branchUserPlatformRoleResources.branch',
        'userPlatformRoles.branchUserPlatformRoleResources.resource',
        'userHasResources',
        'userHasResources.resource',
      ],
    });

    let isNewUser = false;

    if (!user && emailFromToken) {
      user = await this.usersRepository.findOne({
        where: { email: emailFromToken },
        relations: [
          'activeCompany',
          'activeCompany.country',
          'activeCompany.city',
          'activeCompany.category',
          'userHasCompany',
          'userHasCompany.company',
          'userHasCompany.company.tauxCompanies',
          'userHasCompany.company.country',
          'userHasCompany.company.city',
          'userHasCompany.company.category',
          'userPlatformRoles',
          'userPlatformRoles.platform',
          'userPlatformRoles.role',
          'userPlatformRoles.branchUserPlatformRoleResources',
          'userPlatformRoles.branchUserPlatformRoleResources.branch',
          'userPlatformRoles.branchUserPlatformRoleResources.resource',
          'userHasResources',
          'userHasResources.resource',
        ],
      });

      if (user) {
        if (user.provider && user.provider !== 'APPLE') {
          throw new BadRequestException(
            `Ce compte a été créé avec ${user.provider}. Veuillez utiliser ${user.provider} pour vous connecter.`,
          );
        }

        if (!user.appleUserId) {
          await this.usersRepository.update(user.id, { appleUserId });
        }
      }
    }

    if (!user) {
      user = this.usersRepository.create({
        appleUserId,
        email: emailFromToken ?? dto.email ?? undefined,
        fullName,
        provider: 'APPLE',
        role: UserRole.CUSTOMER,
        password: '',
        isActive: true,
      });

      user = await this.usersRepository.save(user);
      isNewUser = true;

      if (user.email) {
        await this.mailService.sendHtmlEmail(
          user.email,
          'Inscription confirmée sur FavorHelp',
          'createCount.html',
          { userWithoutPassword: user, year: new Date().getFullYear() },
        );
      }
    } else {
      if (!user.provider || user.provider !== 'APPLE') {
        await this.usersRepository.update(user.id, { provider: 'APPLE' });
      }
    }

    const access_token = await this.accessToken(user);
    const refresh_token = await this.refreshToken(user);

    const { password, ...userWithoutPassword } = user;

    return {
      message: isNewUser
        ? 'Compte créé et connexion réussie via Apple.'
        : 'Connexion réussie via Apple.',
      data: instanceToPlain(userWithoutPassword),
      access_token,
      refresh_token,
    };
  }

  async updateProfileImage(userId: string, file?: Express.Multer.File) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: [
        'activeCompany',
        'activeCompany.country',
        'activeCompany.city',
        'activeCompany.category',
        'userHasCompany',
        'userHasCompany.company',
        'userHasCompany.company.tauxCompanies',
        'userHasCompany.company.country',
        'userHasCompany.company.city',
        'userHasCompany.company.category', // ✅ Category pour chaque company
        'userPlatformRoles',
        'userPlatformRoles.platform',
        'userPlatformRoles.role',
        'userPlatformRoles.branchUserPlatformRoleResources',
        'userPlatformRoles.branchUserPlatformRoleResources.branch',
        'userPlatformRoles.branchUserPlatformRoleResources.resource',
        'userHasResources',
        'userHasResources.resource',
      ],
    });

    if (!user) throw new NotFoundException('Utilisateur non trouvé.');
    if (!file) throw new BadRequestException('Image invalide.');

    // 🧹 Gestion intelligente selon la source de l’image
    if (user.image) {
      if (user.image.includes('res.cloudinary.com')) {
        const publicId = this.extractPublicId(user.image);
        if (publicId) {
          try {
            await this.cloudinary.handleDeleteImage(publicId);
          } catch (err) {
            console.warn('⚠️ Échec suppression Cloudinary :', err.message);
          }
        }
      } else if (user.image.includes('googleusercontent.com')) {
        console.log('🔵 Image Google détectée, aucune suppression nécessaire.');
      } else {
        console.log('⚪ Aucune image Cloudinary à supprimer.');
      }
    }

    const imageUrl = await this.cloudinary.handleUploadImage(file, 'user');
    user.image = imageUrl;

    const updatedUser = await this.usersRepository.save(user);
    const { password, ...userWithoutPassword } = updatedUser;

    // 🏢 Mapping des companies avec category
    const userHasCompany =
      userWithoutPassword.userHasCompany?.map((uhc) => ({
        id: uhc.id,
        isOwner: uhc.isOwner,
        company: uhc.company
          ? {
              id: uhc.company.id,
              companyName: uhc.company.companyName || '',
              logo: uhc.company.logo,
              banner: uhc.company.banner,
              companyAddress: uhc.company.companyAddress || '',
              typeCompany: uhc.company.typeCompany,
              phone: uhc.company.phone,
              vatNumber: uhc.company.vatNumber,
              registrationDocumentUrl: uhc.company.registrationDocumentUrl,
              warehouseLocation: uhc.company.warehouseLocation,
              email: uhc.company.email,
              website: uhc.company.website,
              status: uhc.company.status,
              companyActivity: uhc.company.companyActivity,
              open_time: uhc.company.open_time,
              delivery_minutes: uhc.company.delivery_minutes,
              distance_km: uhc.company.distance_km,
              latitude: uhc.company.latitude,
              longitude: uhc.company.longitude,
              address: uhc.company.address,
              tauxCompanies: uhc.company.tauxCompanies || [],
              country: uhc.company.country || null,
              city: uhc.company.city || null,
              localCurrency: uhc.company.localCurrency,
              taux: uhc.company.taux,
              category: (uhc.company as any).category || null, // ✅ Category complet
              categoryId: (uhc.company as any).category?.id || null, // ✅ CategoryId
            }
          : null,
      })) ?? [];

    const activeCompany = userHasCompany.find(
      (uhc) => uhc.company?.id === userWithoutPassword.activeCompanyId,
    )?.company;

    const activeCompanyWithCategory = activeCompany
      ? {
          ...activeCompany,
          category: activeCompany.category || null,
          categoryId: activeCompany.category?.id || null,
        }
      : null;

    // 🔑 Mapping des rôles sur plateformes avec branches et ressources
    const userPlatformRoles =
      userWithoutPassword.userPlatformRoles?.map((upr) => ({
        id: upr.id,
        platform: upr.platform
          ? {
              id: upr.platform.id,
              name: upr.platform.name,
              key: upr.platform.key,
              status: upr.platform.status,
            }
          : null,
        role: upr.role
          ? {
              id: upr.role.id,
              key: upr.role.key,
              name: upr.role.name,
              status: upr.role.status,
            }
          : null,
        branchUserPlatformRoleResources:
          upr.branchUserPlatformRoleResources?.map((b) => ({
            id: b.id,
            branch: b.branch,
            resource: b.resource,
            create: b.create,
            read: b.read,
            update: b.update,
            delete: b.delete,
            validate: b.validate,
          })) ?? [],
        createdAt: upr.createdAt,
      })) ?? [];

    // 🔹 Mapping userHasResources
    const userHasResources =
      userWithoutPassword.userHasResources?.map((uhr) => ({
        id: uhr.id,
        create: uhr.create,
        read: uhr.read,
        update: uhr.update,
        delete: uhr.delete,
        validate: uhr.validate,
        resource: uhr.resource
          ? {
              id: uhr.resource.id,
              label: uhr.resource.label,
              value: uhr.resource.value,
              status: uhr.resource.status,
            }
          : null,
      })) ?? [];

    const responseUser = {
      ...userWithoutPassword,
      userHasCompany,
      userPlatformRoles,
      userHasResources,
      activeCompany: activeCompanyWithCategory,
    };

    return {
      message: 'Image de profil mise à jour avec succès.',
      data: instanceToPlain(responseUser),
    };
  }

  private extractPublicId(url: string): string | null {
    try {
      if (!url.includes('res.cloudinary.com')) return null;

      const uploadIndex = url.indexOf('/upload/');
      if (uploadIndex === -1) return null;

      // Extrait la partie après /upload/
      let publicIdPart = url.substring(uploadIndex + '/upload/'.length);

      // Supprime les transformations et versions Cloudinary
      publicIdPart = publicIdPart.replace(/^v\d+\//, '');
      publicIdPart = publicIdPart.replace(/v\d+\//g, '');

      // Supprime l’extension du fichier
      publicIdPart = publicIdPart.replace(/\.[^/.]+$/, '');

      return publicIdPart;
    } catch (error) {
      console.error('Erreur extraction public_id:', error);
      return null;
    }
  }

  async sendOtp(email: string): Promise<any> {
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

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

    // Supprimer l'ancien OTP actif pour ce destinataire
    const existingOtp = await this.otpRepository.findOne({
      where: { email, isUsed: false },
    });
    if (existingOtp) {
      await this.otpRepository.remove(existingOtp);
    }

    // Créer le nouveau OTP
    const otp = this.otpRepository.create({
      email,
      otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });
    await this.otpRepository.save(otp);

    // Vérifier si c'est un email ou un numéro de téléphone
    if (validator.isEmail(email)) {
      // Envoyer par email
      await this.mailService.sendHtmlEmail(email, 'Votre OTP de connexion', 'sendOtp.html', {
        otpCode,
        year: new Date().getFullYear(),
      });
    } else if (validator.isMobilePhone(email, 'any')) {
      // Envoyer par SMS
      const message = `Votre code de validation est : ${otpCode}`;
      const sent = await this.smsHelper.sendSms(email, message); // retourne le code si envoyé
      if (!sent) {
        throw new BadRequestException('Impossible d’envoyer le SMS de validation');
      }
    }

    return { message: 'OTP envoyé avec succès.', otpCode };
  }

  async sendResetPasswordOtp(email: string): Promise<any> {
    const user = await this.usersRepository.findOne({
      where: [
        { email: email }, // Cherche par email
        { phone: email }, // Cherche par téléphone
      ],
    });
    if (!user) {
      throw new BadRequestException('Aucun utilisateur trouvé avec cet email ou numéro.');
    }

    // Générer l'OTP
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const otp = this.otpRepository.create({
      email,
      otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });
    await this.otpRepository.save(otp);

    // Envoyer OTP
    if (validator.isEmail(email)) {
      // Envoi par email
      await this.mailService.sendHtmlEmail(
        email,
        'Réinitialisation de mot de passe',
        'sendOtp.html',
        { otpCode, year: new Date().getFullYear() },
      );
    } else if (validator.isMobilePhone(email, 'any')) {
      // Envoi par SMS
      const message = `Votre code de réinitialisation est : ${otpCode}`;
      const sent = await this.smsHelper.sendSms(email, message);
      if (!sent) {
        throw new BadRequestException('Impossible d’envoyer le SMS de réinitialisation.');
      }
    }

    return { message: 'OTP envoyé avec succès.' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<any> {
    const { email, otpCode, password } = resetPasswordDto;

    const otpEntry = await this.otpRepository.findOne({
      where: { email, otpCode, isUsed: false },
    });

    if (!otpEntry || new Date() > otpEntry.expiresAt) {
      throw new BadRequestException('OTP invalide ou expiré.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.usersRepository.findOne({
      where: [{ email: email }, { phone: email }],
    });
    if (!user) {
      throw new BadRequestException('Utilisateur non trouvé.');
    }

    user.password = hashedPassword;
    await this.usersRepository.save(user);

    otpEntry.isUsed = true;
    await this.otpRepository.save(otpEntry);

    return { message: 'Mot de passe réinitialisé avec succès.' };
  }

  async verifyOtp(email: string, otpCode: string): Promise<{ message: string }> {
    if (!email) {
      throw new BadRequestException('Un email ou un numéro de téléphone est requis.');
    }

    // Recherche d’un OTP valide correspondant à l’email ou téléphone
    const otpEntry = await this.otpRepository.findOne({
      where: {
        email, // ce champ peut contenir un email ou un numéro de téléphone
        otpCode,
        isUsed: false,
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!otpEntry) {
      throw new BadRequestException('Code OTP invalide ou expiré.');
    }

    // Marquer l'OTP comme utilisé
    await this.otpRepository.save(otpEntry);

    return { message: 'OTP validé avec succès.' };
  }

  async getFullProfile(userId: string): Promise<Record<string, any>> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: [
        'activeCompany',
        'activeCompany.country',
        'activeCompany.city',
        'activeCompany.category', // ✅ Ajouter category pour activeCompany
        'userHasCompany',
        'userHasCompany.company',
        'userHasCompany.company.tauxCompanies',
        'userHasCompany.company.country',
        'userHasCompany.company.city',
        'userHasCompany.company.category', // ✅ Ajouter category pour chaque company
        'userPlatformRoles',
        'userPlatformRoles.platform',
        'userPlatformRoles.role',
        'userPlatformRoles.branchUserPlatformRoleResources',
        'userPlatformRoles.branchUserPlatformRoleResources.branch',
        'userPlatformRoles.branchUserPlatformRoleResources.resource',
        'userHasResources',
        'userHasResources.resource',
      ],
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    const { password, ...userWithoutPassword } = user;

    // Mapping des companies et permissions
    const userHasCompany =
      userWithoutPassword.userHasCompany?.map((uhc) => ({
        id: uhc.id,
        isOwner: uhc.isOwner,
        company: uhc.company
          ? {
              id: uhc.company.id,
              companyName: uhc.company.companyName || '',
              logo: uhc.company.logo,
              banner: uhc.company.banner,
              companyAddress: uhc.company.companyAddress || '',
              typeCompany: uhc.company.typeCompany,
              phone: uhc.company.phone,
              vatNumber: uhc.company.vatNumber,
              registrationDocumentUrl: uhc.company.registrationDocumentUrl,
              warehouseLocation: uhc.company.warehouseLocation,
              email: uhc.company.email,
              website: uhc.company.website,
              status: uhc.company.status,
              companyActivity: uhc.company.companyActivity,
              open_time: uhc.company.open_time,
              delivery_minutes: uhc.company.delivery_minutes,
              distance_km: uhc.company.distance_km,
              latitude: uhc.company.latitude,
              longitude: uhc.company.longitude,
              address: uhc.company.address,
              tauxCompanies: uhc.company.tauxCompanies || [],
              country: uhc.company.country || null,
              city: uhc.company.city || null,
              localCurrency: uhc.company.localCurrency,
              taux: uhc.company.taux,
              category: (uhc.company as any).category || null, // ✅ Category complet
              categoryId: (uhc.company as any).category?.id || null, // ✅ CategoryId
            }
          : null,
        permissions:
          uhc.permissions?.map((p) => ({
            id: p.permission?.id,
            name: p.permission?.name,
            create: p.create,
            read: p.read,
            update: p.update,
            delete: p.delete,
            status: p.status,
            createdAt:
              p.permission?.createdAt instanceof Date
                ? p.permission.createdAt
                : new Date(p.permission?.createdAt),
            updatedAt:
              p.permission?.updatedAt instanceof Date
                ? p.permission.updatedAt
                : new Date(p.permission?.updatedAt),
          })) ?? [],
      })) ?? [];

    // Mapping des rôles sur plateformes avec branches et ressources
    const userPlatformRoles =
      userWithoutPassword.userPlatformRoles?.map((upr) => ({
        id: upr.id,
        platform: upr.platform
          ? {
              id: upr.platform.id,
              name: upr.platform.name,
              key: upr.platform.key,
              status: upr.platform.status,
            }
          : null,
        role: upr.role
          ? {
              id: upr.role.id,
              key: upr.role.key,
              name: upr.role.name,
              status: upr.role.status,
            }
          : null,
        branchUserPlatformRoleResources:
          upr.branchUserPlatformRoleResources?.map((b) => ({
            id: b.id,
            branch: b.branch,
            resource: b.resource,
            create: b.create,
            read: b.read,
            update: b.update,
            delete: b.delete,
            validate: b.validate,
          })) ?? [],
        createdAt: upr.createdAt,
      })) ?? [];

    // 🔹 Mapping userHasResources
    const userHasResources =
      userWithoutPassword.userHasResources?.map((uhr) => ({
        id: uhr.id,
        create: uhr.create,
        read: uhr.read,
        update: uhr.update,
        delete: uhr.delete,
        validate: uhr.validate,
        resource: uhr.resource
          ? {
              id: uhr.resource.id,
              label: uhr.resource.label,
              value: uhr.resource.value,
              status: uhr.resource.status,
            }
          : null,
      })) ?? [];

    return {
      ...userWithoutPassword,
      userHasCompany,
      userPlatformRoles,
      userHasResources,
      activeCompany: userWithoutPassword.activeCompany
        ? {
            ...userWithoutPassword.activeCompany,
            country: userWithoutPassword.activeCompany.country || null,
            city: userWithoutPassword.activeCompany.city || null,
            category: userWithoutPassword.activeCompany.category || null, // ✅ Category actif
            categoryId: userWithoutPassword.activeCompany.category?.id || null, // ✅ CategoryId actif
          }
        : null,
    };
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

    const secretKey = this.configService.get<string>('REFRESH_TOKEN_SECRET_KEY');
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
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refresh_token) {
      throw new BadRequestException('Le refresh_token est requis.');
    }

    const secret = this.configService.get<string>('REFRESH_TOKEN_SECRET_KEY');
    if (!secret) {
      throw new Error('REFRESH_TOKEN_SECRET_KEY is not défini dans .env');
    }

    let decoded: any;
    try {
      decoded = await this.jwtService.verifyAsync(refresh_token, { secret });
    } catch (err) {
      throw new BadRequestException('Refresh token invalide ou expiré.');
    }

    const user = await this.usersRepository.findOne({
      where: { id: decoded.id },
    });

    if (!user) {
      throw new BadRequestException('Utilisateur introuvable.');
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

  async verifyToken(secret: string, token: string): Promise<boolean> {
    return speakeasy.totp.verify({
      secret, // Le secret stocké dans la base de données
      encoding: 'base32', // L'encodage doit être 'base32'
      token, // Le token envoyé par l'utilisateur
      window: 60, // Permet de vérifier également les tokens dans une fenêtre de 1 période (±30 secondes)
    });
  }

  async findById(userId: string): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`Utilisateur avec ID ${userId} non trouvé.`);
    }
    return user;
  }

  async set2FASecret(userId: string, secret: string): Promise<void> {
    await this.usersRepository.update(userId, { twoFASecret: secret });
  }

  async enable2FA(userId: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé.');
    }

    user.isTwoFAEnabled = true; // Mettre à jour le champ de l'utilisateur pour activer le 2FA
    await this.usersRepository.save(user);
  }

  async findAll(role?: string) {
    const roles = Object.values(UserRole);

    let users: UserEntity[];
    const relations = [
      'activeCompany',
      'activeCompany.country',
      'activeCompany.city',
      'activeCompany.category', // ✅ Ajouter category
      'addresses',
      'userHasCompany',
      'userHasCompany.company',
      'userHasCompany.company.tauxCompanies',
      'userHasCompany.company.country',
      'userHasCompany.company.city',
      'userHasCompany.company.category', // ✅ Ajouter category
      'userHasCompany.permissions',
      'userHasCompany.permissions.permission',
      'userPlatformRoles',
      'userPlatformRoles.platform',
      'userPlatformRoles.role',
      'userPlatformRoles.branchUserPlatformRoleResources',
      'userPlatformRoles.branchUserPlatformRoleResources.branch',
      'userPlatformRoles.branchUserPlatformRoleResources.resource',
      'userHasResources',
      'userHasResources.resource',
    ];

    if (role && roles.includes(role as UserRole)) {
      users = await this.usersRepository.find({
        where: { role: role as UserRole },
        relations,
        order: { createdAt: 'DESC' },
      });
    } else {
      users = await this.usersRepository.find({
        relations,
        order: { createdAt: 'DESC' },
      });
    }

    const sanitizedUsers = users.map((user) => {
      const { password, ...userWithoutPassword } = user;

      const userHasCompany =
        userWithoutPassword.userHasCompany?.map((uhc) => ({
          id: uhc.id,
          isOwner: uhc.isOwner,
          company: uhc.company
            ? {
                id: uhc.company.id,
                companyName: uhc.company.companyName || '',
                logo: uhc.company.logo,
                banner: uhc.company.banner,
                companyAddress: uhc.company.companyAddress || '',
                typeCompany: uhc.company.typeCompany,
                phone: uhc.company.phone,
                vatNumber: uhc.company.vatNumber,
                registrationDocumentUrl: uhc.company.registrationDocumentUrl,
                warehouseLocation: uhc.company.warehouseLocation,
                email: uhc.company.email,
                website: uhc.company.website,
                status: uhc.company.status,
                companyActivity: uhc.company.companyActivity,
                open_time: uhc.company.open_time,
                delivery_minutes: uhc.company.delivery_minutes,
                distance_km: uhc.company.distance_km,
                latitude: uhc.company.latitude,
                longitude: uhc.company.longitude,
                address: uhc.company.address,
                tauxCompanies: uhc.company.tauxCompanies || [],
                country: uhc.company.country || null,
                city: uhc.company.city || null,
                localCurrency: uhc.company.localCurrency,
                taux: uhc.company.taux,
                category: uhc.company.category || null, // ✅ Category complet
                categoryId: uhc.company.category?.id || null, // ✅ CategoryId
              }
            : null,
          permissions:
            uhc.permissions?.map((p) => ({
              id: p.permission?.id,
              name: p.permission?.name,
              create: p.create,
              read: p.read,
              update: p.update,
              delete: p.delete,
              status: p.status,
              createdAt:
                p.permission?.createdAt instanceof Date
                  ? p.permission.createdAt
                  : new Date(p.permission?.createdAt),
              updatedAt:
                p.permission?.updatedAt instanceof Date
                  ? p.permission.updatedAt
                  : new Date(p.permission?.updatedAt),
            })) ?? [],
        })) ?? [];

      const userPlatformRoles =
        userWithoutPassword.userPlatformRoles?.map((upr) => ({
          id: upr.id,
          platform: upr.platform
            ? {
                id: upr.platform.id,
                name: upr.platform.name,
                key: upr.platform.key,
                status: upr.platform.status,
              }
            : null,
          role: upr.role
            ? {
                id: upr.role.id,
                key: upr.role.key,
                name: upr.role.name,
                status: upr.role.status,
              }
            : null,
          branchUserPlatformRoleResources:
            upr.branchUserPlatformRoleResources?.map((b) => ({
              id: b.id,
              branch: b.branch,
              resource: b.resource,
              create: b.create,
              read: b.read,
              update: b.update,
              delete: b.delete,
              validate: b.validate,
            })) ?? [],
          createdAt: upr.createdAt,
        })) ?? [];

      const userHasResources =
        userWithoutPassword.userHasResources?.map((uhr) => ({
          id: uhr.id,
          resource: uhr.resource,
          create: uhr.create,
          read: uhr.read,
          update: uhr.update,
          delete: uhr.delete,
          validate: uhr.validate,
        })) ?? [];

      return {
        ...userWithoutPassword,
        userHasCompany,
        userPlatformRoles,
        userHasResources,
        activeCompany: userWithoutPassword.activeCompany
          ? {
              ...userWithoutPassword.activeCompany,
              country: userWithoutPassword.activeCompany.country || null,
              city: userWithoutPassword.activeCompany.city || null,
              category: userWithoutPassword.activeCompany.category || null, // ✅ Category actif
              categoryId: userWithoutPassword.activeCompany.category?.id || null, // ✅ CategoryId actif
            }
          : null,
      };
    });

    return sanitizedUsers;
  }

  async findOne(id: string): Promise<{ data: UserEntity }> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    return { data: user };
  }

  async findUserByEmail(email: string) {
    return await this.usersRepository.findOneBy({ email });
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    await this.usersRepository.remove(user.data);
    return { message: `User #${id} removed.` };
  }

  async findAllWithDetails() {
    const relations = [
      'activeCompany',
      'activeCompany.country',
      'activeCompany.city',
      'activeCompany.category', // ✅ Category actif
      'addresses',
      'userHasCompany',
      'userHasCompany.company',
      'userHasCompany.company.tauxCompanies',
      'userHasCompany.company.country',
      'userHasCompany.company.city',
      'userHasCompany.company.category', // ✅ Category complet
      'userHasCompany.permissions',
      'userHasCompany.permissions.permission',
      'userPlatformRoles',
      'userPlatformRoles.platform',
      'userPlatformRoles.role',
      'userPlatformRoles.branchUserPlatformRoleResources',
      'userPlatformRoles.branchUserPlatformRoleResources.branch',
      'userPlatformRoles.branchUserPlatformRoleResources.resource',
      'userHasResources',
      'userHasResources.resource',
    ];

    const users = await this.usersRepository.find({
      relations,
      order: { createdAt: 'DESC' },
    });

    const sanitizedUsers = users.map((user) => {
      const { password, ...userWithoutPassword } = user;

      const userHasCompany =
        userWithoutPassword.userHasCompany?.map((uhc) => ({
          id: uhc.id,
          isOwner: uhc.isOwner,
          company: uhc.company
            ? {
                id: uhc.company.id,
                companyName: uhc.company.companyName || '',
                logo: uhc.company.logo,
                banner: uhc.company.banner,
                companyAddress: uhc.company.companyAddress || '',
                typeCompany: uhc.company.typeCompany,
                phone: uhc.company.phone,
                vatNumber: uhc.company.vatNumber,
                registrationDocumentUrl: uhc.company.registrationDocumentUrl,
                warehouseLocation: uhc.company.warehouseLocation,
                email: uhc.company.email,
                website: uhc.company.website,
                status: uhc.company.status,
                companyActivity: uhc.company.companyActivity,
                open_time: uhc.company.open_time,
                delivery_minutes: uhc.company.delivery_minutes,
                distance_km: uhc.company.distance_km,
                latitude: uhc.company.latitude,
                longitude: uhc.company.longitude,
                address: uhc.company.address,
                tauxCompanies: uhc.company.tauxCompanies || [],
                country: uhc.company.country || null,
                city: uhc.company.city || null,
                localCurrency: uhc.company.localCurrency,
                taux: uhc.company.taux,
                category: uhc.company.category || null, // ✅ Category complet
                categoryId: uhc.company.category?.id || null, // ✅ CategoryId
              }
            : null,
          permissions:
            uhc.permissions?.map((p) => ({
              id: p.permission?.id,
              name: p.permission?.name,
              create: p.create,
              read: p.read,
              update: p.update,
              delete: p.delete,
              status: p.status,
              createdAt:
                p.permission?.createdAt instanceof Date
                  ? p.permission.createdAt
                  : new Date(p.permission?.createdAt),
              updatedAt:
                p.permission?.updatedAt instanceof Date
                  ? p.permission.updatedAt
                  : new Date(p.permission?.updatedAt),
            })) ?? [],
        })) ?? [];

      const userPlatformRoles =
        userWithoutPassword.userPlatformRoles?.map((upr) => ({
          id: upr.id,
          platform: upr.platform
            ? {
                id: upr.platform.id,
                name: upr.platform.name,
                key: upr.platform.key,
                status: upr.platform.status,
              }
            : null,
          role: upr.role
            ? {
                id: upr.role.id,
                key: upr.role.key,
                name: upr.role.name,
                status: upr.role.status,
              }
            : null,
          branchUserPlatformRoleResources:
            upr.branchUserPlatformRoleResources?.map((b) => ({
              id: b.id,
              branch: b.branch,
              resource: b.resource,
              create: b.create,
              read: b.read,
              update: b.update,
              delete: b.delete,
              validate: b.validate,
            })) ?? [],
          createdAt: upr.createdAt,
        })) ?? [];

      const userHasResources =
        userWithoutPassword.userHasResources?.map((uhr) => ({
          id: uhr.id,
          resource: uhr.resource,
          create: uhr.create,
          read: uhr.read,
          update: uhr.update,
          delete: uhr.delete,
          validate: uhr.validate,
        })) ?? [];

      return {
        ...userWithoutPassword,
        userHasCompany,
        userPlatformRoles,
        userHasResources,
        activeCompany: userWithoutPassword.activeCompany
          ? {
              ...userWithoutPassword.activeCompany,
              country: userWithoutPassword.activeCompany.country || null,
              city: userWithoutPassword.activeCompany.city || null,
              category: userWithoutPassword.activeCompany.category || null, // ✅ Category actif
              categoryId: userWithoutPassword.activeCompany.category?.id || null, // ✅ CategoryId actif
            }
          : null,
      };
    });

    return sanitizedUsers;
  }

  async toggleUserActiveStatus(userId: string) {
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
      ],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 2️ Basculer automatiquement le statut (true → false, false → true)
    user.isActive = !user.isActive;
    await this.usersRepository.save(user);

    // 3️⃣ Supprimer le mot de passe avant retour
    const { password, ...rest } = user;

    return {
      message: `Utilisateur ${user.isActive ? 'activé' : 'désactivé'} avec succès`,
      data: rest,
    };
  }

  async assignResourcesToUser(
    userId: string,
    resources: {
      resourceId: string;
      create: boolean;
      read: boolean;
      update: boolean;
      delete: boolean;
      validate: boolean;
    }[],
  ): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('Utilisateur non trouvé.');

    for (const r of resources) {
      const resource = await this.resourcesRepository.findOne({ where: { id: r.resourceId } });
      if (!resource) throw new BadRequestException(`Ressource ${r.resourceId} non trouvée.`);

      let userHasResource = await this.userHasResourceRepository.findOne({
        where: { user: { id: userId }, resource: { id: r.resourceId } },
      });

      if (!userHasResource) {
        userHasResource = this.userHasResourceRepository.create({
          user,
          resource,
          create: r.create,
          read: r.read,
          update: r.update,
          delete: r.delete,
          validate: r.validate,
        });
      } else {
        // Mettre à jour si déjà existant
        userHasResource.create = r.create;
        userHasResource.read = r.read;
        userHasResource.update = r.update;
        userHasResource.delete = r.delete;
        userHasResource.validate = r.validate;
      }

      await this.userHasResourceRepository.save(userHasResource);
    }

    return { message: 'Ressources assignées avec succès.' };
  }

  async getOneResourceForUser(userId: string, resourceId: string): Promise<any> {
    const resource = await this.userHasResourceRepository.findOne({
      where: { user: { id: userId }, resource: { id: resourceId } },
      relations: ['resource'],
    });

    if (!resource) throw new NotFoundException('Ressource non trouvée pour cet utilisateur.');

    return {
      id: resource.id,
      resource: {
        id: resource.resource.id,
        label: resource.resource.label,
        value: resource.resource.value,
        status: resource.resource.status,
        deleted: resource.resource.deleted,
        createdAt: resource.resource.createdAt,
        updatedAt: resource.resource.updatedAt,
      },
      create: resource.create,
      read: resource.read,
      update: resource.update,
      delete: resource.delete,
      validate: resource.validate,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
    };
  }

  // Mettre à jour des ressources existantes pour un utilisateur
  async updateResourcesForUser(
    userId: string,
    resources: {
      resourceId: string;
      create?: boolean;
      read?: boolean;
      update?: boolean;
      delete?: boolean;
      validate?: boolean;
    }[],
  ): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('Utilisateur non trouvé.');

    for (const r of resources) {
      const userHasResource = await this.userHasResourceRepository.findOne({
        where: { user: { id: userId }, resource: { id: r.resourceId } },
      });

      if (!userHasResource)
        throw new NotFoundException(`Ressource ${r.resourceId} non assignée.`);

      userHasResource.create = r.create ?? userHasResource.create;
      userHasResource.read = r.read ?? userHasResource.read;
      userHasResource.update = r.update ?? userHasResource.update;
      userHasResource.delete = r.delete ?? userHasResource.delete;
      userHasResource.validate = r.validate ?? userHasResource.validate;

      await this.userHasResourceRepository.save(userHasResource);
    }

    return { message: 'Permissions mises à jour avec succès.' };
  }

  async deleteOwnAccount(
    userId: string,
    password: string,
  ): Promise<{ message: string; data: any }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'fullName', 'email', 'phone', 'deleted', 'isActive', 'password'],
    });

    if (!password) {
      throw new BadRequestException(
        'Veuillez fournir votre mot de passe pour supprimer le compte.',
      );
    }

    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Mot de passe incorrect.');
    }

    user.deleted = true;

    const savedUser = await this.usersRepository.save(user);

    return {
      message: 'Votre compte a été supprimé avec succès.',
      data: {
        id: savedUser.id,
        fullName: savedUser.fullName,
        email: savedUser.email,
        phone: savedUser.phone,
        deleted: savedUser.deleted,
      },
    };
  }
}
