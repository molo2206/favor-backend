import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  UseGuards,
  UsePipes,
  UseInterceptors,
  UploadedFile,
  ValidationPipe,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { classToPlain } from 'class-transformer';
import { UsersService } from './users.service';
import { UserEntity } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UpdateUserDto } from './dto/update-profile';
import { ResetPasswordDto } from 'src/otp/dto/reset-password.dto';
import { CurrentUser } from './utility/decorators/current-user-decorator';
import { AuthentificationGuard } from './utility/guards/authentification.guard';
import { AuthorizeGuard } from './utility/guards/authorization.guard';
import { UserRole } from './enum/user-role-enum';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Verify2FADto } from './dto/verify2fact.dto';
import * as speakeasy from 'speakeasy';
import { AuthorizeRoles } from './utility/decorators/authorize.roles.decorator';
import { MailService } from 'src/email/email.service';
import { VerifyOtpDto } from './dto/VerifyOtpDto';
import { GoogleLoginDto } from './dto/googleLoginDto.dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  // ────── 🟢 Authentification / Inscription ──────
  @Post('signup')
  async signup(
    @Body() createUserDto: CreateUserDto,
  ): Promise<{ message: string; data: Omit<UserEntity, 'password'> }> {
    const { message, data } = await this.usersService.signup(createUserDto);
    return { message, data };
  }

  @Post('signin')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async signin(@Body() loginUserDto: LoginUserDto): Promise<{ data: string }> {
    return await this.usersService.signin(loginUserDto);
  }

  @Post('/auth/google-login')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async googleLogin(@Body() dto: GoogleLoginDto) {
    return this.usersService.googleLoginByClientData(dto);
  }

  @Post('refresh-token')
  async refresh(@Body('refresh_token') refreshToken: string) {
    const accessToken = await this.usersService.refreshTokenWithValidation(refreshToken);
    return {
      message: 'Nouveau token généré',
      access_token: accessToken,
    };
  }

  // ────── 🔐 Authentification à deux facteurs ──────
  @UseGuards(AuthentificationGuard)
  @Get('generate-2fa')
  async generate2FA(@CurrentUser() currentUser: UserEntity) {
    const secret = this.usersService.generateSecret(currentUser.email);
    const qrCode = await this.usersService.generateQrCode(secret.otpauth_url);

    // On sauvegarde le secret dans la base de données
    await this.usersService.set2FASecret(currentUser.id, secret.base32);

    // On génère le token TOTP (valable pour 30 secondes)
    const token = speakeasy.totp({
      secret: secret.base32,
      encoding: 'base32',
    });

    return {
      message: '2FA généré avec succès',
      qrCode,
      secret: secret.base32,
      token, // ← pour tests
    };
  }
  @Post('verify')
  @UseGuards(AuthentificationGuard)
  async verify2FA(@Body() dto: Verify2FADto, @CurrentUser() currentUser: UserEntity) {
    // Log pour vérifier les valeurs
    // console.log('Vérification 2FA - Secret:', currentUser.twoFASecret);
    // console.log('Vérification 2FA - Token:', dto.token);

    const isValid = await this.usersService.verifyToken(
      currentUser.twoFASecret, // Secret stocké dans la base
      dto.token, // Token envoyé par l'utilisateur
    );

    if (!isValid) {
      console.log('Token invalide');
      throw new BadRequestException('Token 2FA invalide');
    }

    // Activer le 2FA dans la base de données si le token est valide
    await this.usersService.enable2FA(currentUser.id);

    return { message: '2FA activé avec succès.' };
  }

  // ────── 🧑‍💻 Mise à jour de profil et image ──────

  @UseGuards(AuthentificationGuard)
  @Patch('me')
  async updateUser(
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: UserEntity,
  ) {
    const user = await this.usersService.update(updateUserDto, currentUser);
    return classToPlain(user);
  }

  @UseGuards(AuthentificationGuard)
  @Patch('profile/image')
  @UseInterceptors(FileInterceptor('image'))
  async updateProfileImage(
    @UploadedFile() file: Express.Multer.File,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @CurrentUser() user: any,
  ) {
    return this.usersService.updateProfileImage(user.id, file);
  }
  // ────── 🔐 Profil personnel ──────

  @UseGuards(AuthentificationGuard)
  @Get('me')
  async getProfile(
    @CurrentUser() currentUser: UserEntity,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ data: Record<string, any> }> {
    if (!currentUser) {
      throw new BadRequestException('Utilisateur non connecté.');
    }

    const fullUser = await this.usersService.getFullProfile(currentUser.id);
    return { data: fullUser };
  }

  // ────── 🔄 Mot de passe oublié / réinitialisation ──────

  @Post('forgot-password')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async forgotPassword(@Body() body: { email: string }) {
    if (!body || !body.email) {
      throw new BadRequestException("L'email est requis.");
    }
    return await this.usersService.sendResetPasswordOtp(body.email);
  }

  @Post('reset-password')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return await this.usersService.resetPassword(resetPasswordDto);
  }

  @UseGuards(AuthentificationGuard)
  @Patch('me/change-password')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() currentUser: UserEntity) {
    return await this.usersService.changePassword(currentUser.id, dto);
  }

  @Post('verify-otp')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async verifyOtpCode(@Body() dto: VerifyOtpDto) {
    if (!dto.email || !dto.code) {
      VerifyOtpDto;
      throw new BadRequestException('Email et code sont requis');
    }
    return this.usersService.verifyOtp(dto.email, dto.code);
  }
  // ────── 👥 Gestion des utilisateurs (admin) ──────

  @UseGuards(AuthentificationGuard, AuthorizeGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @Get('all')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findAll(@Query('role') role?: string): Promise<any> {
    return await this.usersService.findAll(role);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<{ data: UserEntity }> {
    return this.usersService.findOne(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
    return { message: 'Utilisateur supprimé avec succès.' };
  }

  @Post('send')
  async sendEmail() {
    await this.mailService.sendHtmlEmail(
      'devmolomolo@gmail.com',
      'Bienvenue sur notre plateforme',
      'welcome.html',
    );
    return { message: 'Email envoyé' };
  }
}
