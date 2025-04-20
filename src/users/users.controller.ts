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
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
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
import { UserRole } from './utility/common/user-role-enum';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Verify2FADto } from './dto/verify2fact.dto';
import * as speakeasy from 'speakeasy';
import { AuthorizeRoles } from './utility/decorators/authorize.roles.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  // ────── 🟢 Authentification / Inscription ──────

  @Post('signup')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async signup(@Body() createUserDto: CreateUserDto): Promise<{ user: Omit<UserEntity, 'password'> }> {
    const user = await this.usersService.signup(createUserDto);
    return { user };
  }

  @Post('signin')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async signin(@Body() loginUserDto: LoginUserDto): Promise<{ data: string }> {
    return await this.usersService.signin(loginUserDto);
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
  async verify2FA(
    @Body() dto: Verify2FADto,
    @CurrentUser() currentUser: UserEntity,
  ) {
    // Log pour vérifier les valeurs
    // console.log('Vérification 2FA - Secret:', currentUser.twoFASecret);
    // console.log('Vérification 2FA - Token:', dto.token);

    const isValid = await this.usersService.verifyToken(
      currentUser.twoFASecret, // Secret stocké dans la base
      dto.token,                // Token envoyé par l'utilisateur
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
  @Patch(':id')
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: UserEntity,
  ) {
    const user = await this.usersService.update(id, updateUserDto, currentUser);
    return classToPlain(user);
  }

  @UseGuards(AuthentificationGuard)
  @Patch('profile/image')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads/users',
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          const filename = `user-${uniqueSuffix}${ext}`;
          callback(null, filename);
        },
      }),
    }),
  )
  async updateProfileImage(
    @UploadedFile() file: Express.Multer.File,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni.');
    }

    const imageDto = { image: `/uploads/users/${file.filename}` };
    return this.usersService.updateProfileImage(user.id, imageDto);
  }

  // ────── 🔐 Profil personnel ──────

  @UseGuards(AuthentificationGuard)
  @Get('me')
  async getProfile(@CurrentUser() currentUser: UserEntity): Promise<{ data: UserEntity }> {
    if (!currentUser) {
      throw new UnauthorizedException('Utilisateur non connecté.');
    }
    return { data: currentUser };
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
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() currentUser: UserEntity,
  ) {
    return await this.usersService.changePassword(currentUser.id, dto);
  }
  // ────── 👥 Gestion des utilisateurs (admin) ──────

  @UseGuards(AuthentificationGuard, AuthorizeGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @Get('all')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findAll(): Promise<any> {
    return await this.usersService.findAll();
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
}
