import { ConfigService } from '@nestjs/config';
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
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
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(OtpEntity)
    private readonly otpRepository: Repository<OtpEntity>,

    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly cloudinary: CloudinaryService,
    private readonly mailService: MailService,
  ) {}

  async signup(createUserDto: CreateUserDto): Promise<{ message: string; data: any }> {
    const { email, phone, otpCode, password } = createUserDto;

    // Vérification doublons
    if (phone && (await this.usersRepository.findOne({ where: { phone } }))) {
      throw new BadRequestException('Un compte avec ce numéro de téléphone existe déjà.');
    }
    if (await this.usersRepository.findOne({ where: { email } })) {
      throw new BadRequestException('Un compte avec cet email existe déjà.');
    }

    // Étape 1 → envoi OTP si otpCode vide
    if (!otpCode) {
      await this.sendOtp(email); // envoi OTP
      return {
        message: 'Un code OTP a été envoyé à votre adresse e-mail.',
        data: { email }, // on renvoie juste l'email pour l'info
      };
    }

    // Étape 2 → vérification OTP
    const otpEntry = await this.otpRepository.findOne({
      where: { email, otpCode, isUsed: false },
    });

    if (!otpEntry || new Date() > otpEntry.expiresAt) {
      throw new BadRequestException('OTP invalide ou expiré.');
    }

    // Création utilisateur
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
      role: UserRole.CUSTOMER,
    });

    const savedUser = await this.usersRepository.save(user);

    // Marquer OTP comme utilisé
    otpEntry.isUsed = true;
    otpEntry.user = savedUser;
    await this.otpRepository.save(otpEntry);

    const { password: _pw, ...userWithoutPassword } = savedUser;

    // Envoi email de bienvenue
    await this.mailService.sendHtmlEmail(
      email,
      'Bienvenue dans FavorHelp ',
      'createCount.html',
      { userWithoutPassword, year: new Date().getFullYear() },
    );

    return {
      message: 'Inscription réussie. Bienvenue !',
      data: userWithoutPassword,
    };
  }

  async update(
    updateUserDto: Partial<UpdateUserDto>,
    currentUser: UserEntity,
  ): Promise<{ message: string; data: any }> {
    try {
      const user = await this.usersRepository.findOne({
        where: { id: currentUser.id },
      });

      if (!user) {
        throw new NotFoundException(`Utilisateur avec l'ID ${currentUser.id} non trouvé`);
      }

      Object.assign(user, updateUserDto);
      await this.usersRepository.save(user);

      const fullUser = await this.usersRepository.findOne({
        where: { id: user.id },
        relations: [
          'activeCompany',
          'userHasCompany',
          'userHasCompany.company',
          'userHasCompany.permissions',
          'userHasCompany.permissions.permission',
          'userHasCompany.company.tauxCompanies',
          'userHasCompany.company.country',
          'userHasCompany.company.city',
        ],
      });

      if (!fullUser) {
        throw new NotFoundException('Utilisateur enrichi introuvable après la mise à jour.');
      }

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
        },
      };
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l’utilisateur:', error);
      throw new Error('Une erreur interne est survenue.');
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
      .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
      .leftJoinAndSelect('userHasCompany.company', 'company')
      .leftJoinAndSelect('userHasCompany.permissions', 'permissions')
      .leftJoinAndSelect('permissions.permission', 'permission')
      .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
      .where('users.email = :email', { email: userSignInDto.email })
      .getOne();

    if (!user) {
      throw new BadRequestException("Cette adresse e-mail n'existe pas.");
    }

    if (!user.password) {
      throw new BadRequestException('Mot de passe non défini pour ce compte.');
    }

    const isPasswordValid = await bcrypt.compare(userSignInDto.password, user.password);

    if (!isPasswordValid) {
      throw new BadRequestException('Mot de passe incorrect.');
    }

    const token = await this.accessToken(user);
    const refresh_t = await this.refreshToken(user);
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

    const activeCompany = userHasCompany.find(
      (uhc) => uhc.company?.id === userWithoutPassword.activeCompanyId,
    )?.company;

    return {
      message: 'Connexion réussie !',
      data: {
        id: userWithoutPassword.id,
        fullName: userWithoutPassword.fullName,
        email: userWithoutPassword.email,
        phone: userWithoutPassword.phone,
        image: userWithoutPassword.image,
        role: userWithoutPassword.role,
        isActive: userWithoutPassword.isActive,
        country: userWithoutPassword.country,
        city: userWithoutPassword.city,
        activeCompanyId: userWithoutPassword.activeCompanyId,
        address: userWithoutPassword.address,
        preferredLanguage: userWithoutPassword.preferredLanguage,
        loyaltyPoints: userWithoutPassword.loyaltyPoints,
        dateOfBirth: userWithoutPassword.dateOfBirth,
        vehicleType: userWithoutPassword.vehicleType,
        plateNumber: userWithoutPassword.plateNumber,
        defaultAddressId: userWithoutPassword.defaultAddressId,
        defaultAddress: userWithoutPassword.defaultAddress,
        userHasCompany,
        activeCompany,
      },
      access_token: token,
      refresh_token: refresh_t,
    };
  }

  async googleLoginByClientData(dto: GoogleLoginDto): Promise<{
    message: string;
    data: any;
    token: string;
    refresh_token: string;
  }> {
    const { email, fullName, image } = dto;

    if (!email) throw new BadRequestException("L'email est requis.");

    // Vérifier si l'utilisateur existe déjà
    let user = await this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
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
        role: UserRole.CUSTOMER, // ou UserRole.CUSTOMER si enum
        provider: 'google',
        password: '',
        isActive: true,
        image: image || undefined,
      });

      user = await this.usersRepository.save(user);
      isNewUser = true;

      await this.mailService.sendHtmlEmail(
        email,
        'Inscription confirmée sur AfiaGap',
        'createCount.html',
        {
          userWithoutPassword: user,
          year: new Date().getFullYear(),
        },
      );
    }

    // Générer les tokens JWT
    const token = await this.accessToken(user);
    const refresh_token = await this.refreshToken(user);

    // Nettoyage de l'objet user
    const { password, ...userWithoutPassword } = user;

    return {
      message: isNewUser
        ? 'Compte créé et connexion réussie via Google.'
        : 'Connexion réussie via Google.',
      data: userWithoutPassword,
      token,
      refresh_token,
    };
  }

  async updateProfileImage(userId: string, file?: Express.Multer.File) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: [
        'activeCompany',
        'userHasCompany',
        'userHasCompany.company',
        'userHasCompany.permissions',
        'userHasCompany.permissions.permission',
        'userHasCompany.company.tauxCompanies',
      ],
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé.');
    }

    if (!file) {
      throw new BadRequestException('Image invalide.');
    }

    if (user.image) {
      await this.cloudinary.handleDeleteImage(user.image);
    }

    const imageUrl = await this.cloudinary.handleUploadImage(file, 'user');
    user.image = imageUrl;

    const updatedUser = await this.usersRepository.save(user);

    const { password, ...userWithoutPassword } = updatedUser;

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

    const responseUser = {
      ...userWithoutPassword,
      userHasCompany,
      activeCompany: userWithoutPassword.activeCompany,
    };
    const sanitizedUser = instanceToPlain(responseUser);

    return {
      message: 'Image de profil mise à jour avec succès.',
      data: sanitizedUser,
    };
  }

  async sendOtp(email: string): Promise<any> {
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

    // Validation DTO (pour s'assurer que l'email est correct)
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

    // Supprimer l'ancien OTP actif pour ce mail
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

    // Envoyer l'email
    await this.mailService.sendHtmlEmail(email, 'Votre OTP de connexion', 'sendOtp.html', {
      otpCode,
      year: new Date().getFullYear(),
    });

    return { message: 'OTP envoyé avec succès.', otpCode };
  }

  async sendResetPasswordOtp(email: string): Promise<any> {
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      throw new BadRequestException('Aucun utilisateur trouvé avec cet email.');
    }

    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const otp = this.otpRepository.create({
      email,
      otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    await this.otpRepository.save(otp);

    await this.mailService.sendHtmlEmail(
      email,
      'Réinitialisation de mot de passe',
      'sendOtp.html',
      { otpCode, year: new Date().getFullYear() }, // envoi otpCode + année
    );
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
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      throw new BadRequestException('Utilisateur non trouvé.');
    }

    user.password = hashedPassword;
    await this.usersRepository.save(user);

    otpEntry.isUsed = true;
    await this.otpRepository.save(otpEntry);

    return { message: 'Mot de passe réinitialisé avec succès.' };
  }

  async verifyOtp(email: string, code: string): Promise<{ message: string }> {
    // 1. Recherche d’un OTP valide (non utilisé et non expiré)
    const otpEntry = await this.otpRepository.findOne({
      where: {
        email: email.toLowerCase(),
        otpCode: code,
        isUsed: false,
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!otpEntry) {
      throw new BadRequestException('Code OTP invalide ou expiré.');
    }
    return { message: 'OTP validé avec succès.' };
  }

  async getFullProfile(userId: string): Promise<Record<string, any>> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: [
        'activeCompany',
        'userHasCompany',
        'userHasCompany.company',
        'userHasCompany.company.tauxCompanies', // chemin correct
        'userHasCompany.permissions',
        'userHasCompany.permissions.permission',
        'userHasCompany.company.country',
        'userHasCompany.company.city',
      ],
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

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

    return {
      ...userWithoutPassword,
      userHasCompany,
      activeCompany: userWithoutPassword.activeCompany,
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

  async refreshTokenWithValidation(refresh_token: string): Promise<string> {
    if (!refresh_token) {
      throw new BadRequestException('Le refresh_token est requis.');
    }

    let decoded: any;
    const secret = this.configService.get<string>('REFRESH_TOKEN_SECRET_KEY'); // Utilise la bonne clé ici

    if (!secret) {
      throw new Error('REFRESH_TOKEN_SECRET_KEY is not défini dans .env');
    }

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

    return this.accessToken(user); // Génère un nouveau access_token
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

    if (role && roles.includes(role as UserRole)) {
      const usersByRole = await this.usersRepository.find({
        where: { role: role as UserRole },
      });

      return { data: usersByRole }; // NE PAS faire un deuxième find() ici
    }

    // Si aucun role demandé, on retourne tout
    const users = await this.usersRepository.find();
    return { data: users };
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
    const users = await this.usersRepository.find({
      relations: [
        'userHasCompany',
        'activeCompany',
        'travelReservations',
        'addresses',
        'defaultAddress',
        'orders',
        'rentalContracts',
        'saleTransactions',
        'bookings',
        'userPlatformRoles',
      ],
      order: { createdAt: 'DESC' },
    });

    return users;
  }
}
