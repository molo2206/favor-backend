/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { sign } from 'jsonwebtoken';
import { UserEntity } from './entities/user.entity';
import { OtpEntity } from 'src/otp/entities/otp.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { MailerService } from '@nestjs-modules/mailer';
import { LoginUserDto } from './dto/login-user.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { VerifyOtpDto } from 'src/otp/dto/verify-otp.dto';
import { ResetPasswordDto } from 'src/otp/dto/reset-password.dto';
import { UpdateUserImageDto } from './dto/update-user.dto';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { UpdateUserDto } from './dto/update-profile';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly mailerService: MailerService,
    @InjectRepository(OtpEntity)
    private readonly otpRepository: Repository<OtpEntity>,
  ) { }

  async signup(createUserDto: CreateUserDto): Promise<any> {
    const { email, otpCode, password, roles } = createUserDto;

    const userExists = await this.usersRepository.findOne({ where: { email } });
    if (userExists) {
      throw new BadRequestException('Un compte avec cet email existe déjà.');
    }

    if (!otpCode) {
      return this.sendOtp(email);
    }

    const otpEntry = await this.otpRepository.findOne({
      where: {
        email,
        otpCode,
        isUsed: false,
      },
    });

    if (!otpEntry || new Date() > otpEntry.expiresAt) {
      throw new BadRequestException('OTP invalide ou expiré.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRoles = Array.isArray(roles) ? roles : ['user'];

    const user = this.usersRepository.create({
      ...createUserDto,
      email,
      password: hashedPassword,
      role: userRoles[0],
    });

    const savedUser = await this.usersRepository.save(user);

    otpEntry.isUsed = true;
    otpEntry.user = savedUser;
    await this.otpRepository.save(otpEntry);

    const { password: _pw, ...userWithoutPassword } = savedUser;
    return userWithoutPassword;
  }

  async update(id: string, updateUserDto: Partial<UpdateUserDto>, currentUser: UserEntity): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Utilisateur avec l'ID ${id} non trouvé`);
    }
    Object.assign(user, updateUserDto);
    return await this.usersRepository.save(user);
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto): Promise<{ message: string }> {
    const { currentPassword, newPassword } = changePasswordDto;
    const user = await this.usersRepository.findOne({ where: { id: userId }, select: ['id', 'password'] });

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


  async signin(loginUserDto: LoginUserDto) {
    const user = await this.usersRepository
      .createQueryBuilder('users')
      .addSelect('users.password')
      .where('users.email = :email', { email: loginUserDto.email })
      .getOne();

    if (!user) throw new UnauthorizedException('Invalid credentials.');

    const isPasswordValid = await bcrypt.compare(loginUserDto.password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials.');

    const token = await this.accessToken(user);

    const { password, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      access_token: token,
    };
  }

  async updateProfileImage(userId: string, dto: UpdateUserImageDto) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé.');
    }

    if (!dto.image) {
      throw new BadRequestException('Image invalide.');
    }

    user.image = dto.image;
    const updatedUser = await this.usersRepository.save(user);
    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async sendOtp(email: string): Promise<any> {
    const dto = plainToInstance(VerifyOtpDto, { email, otpCode: '000000' });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      const errorMessages = errors.map(err => Object.values(err.constraints ?? {}).join(', ')).join(', ');
      throw new BadRequestException(errorMessages);
    }

    const existingOtp = await this.otpRepository.findOne({ where: { email, isUsed: false } });
    if (existingOtp && new Date() < existingOtp.expiresAt) {
      return { message: 'Un OTP actif existe déjà.', otpCode: existingOtp.otpCode };
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otp = this.otpRepository.create({
      email,
      otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    await this.otpRepository.save(otp);

    await this.mailerService.sendMail({
      to: email,
      subject: 'Votre code de vérification',
      text: `Votre code OTP est : ${otpCode}. Il est valide pour 10 minutes.`,
    });

    return { message: 'OTP envoyé avec succès.', otpCode };
  }

  async sendResetPasswordOtp(email: string): Promise<any> {
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      throw new BadRequestException("Aucun utilisateur trouvé avec cet email.");
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otp = this.otpRepository.create({
      email,
      otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    await this.otpRepository.save(otp);

    await this.mailerService.sendMail({
      to: email,
      subject: 'Réinitialisation de mot de passe',
      text: `Votre code de réinitialisation est : ${otpCode}. Il est valide pendant 10 minutes.`,
    });

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
      throw new BadRequestException("Utilisateur non trouvé.");
    }

    user.password = hashedPassword;
    await this.usersRepository.save(user);

    otpEntry.isUsed = true;
    await this.otpRepository.save(otpEntry);

    return { message: 'Mot de passe réinitialisé avec succès.' };
  }

  async accessToken(user: UserEntity) {
    const secretKey = process.env.ACCESS_TOKEN_SECRET_KEY;
    if (!secretKey) throw new Error('Clé secrète JWT manquante');
    return sign({ id: user.id, email: user.email, roles: user.role }, secretKey, { expiresIn: '30m' });
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
      window: 1, // Permet de vérifier également les tokens dans une fenêtre de 1 période (±30 secondes)
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

  async findAll() {
    return await this.usersRepository.find();
  }

  async findOne(id: string): Promise<UserEntity> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findUserByEmail(email: string) {
    return await this.usersRepository.findOneBy({ email });
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    await this.usersRepository.remove(user);
    return { message: `User #${id} removed.` };
  }
}
