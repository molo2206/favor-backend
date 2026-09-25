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
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { classToPlain } from 'class-transformer';
import { UsersService } from './users.service';
import { UserEntity } from './entities/user.entity';
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
import { DeleteOwnAccountDto } from './dto/deleteOwnAccountDto.dto';
import { AppleLoginDto } from './dto/apple-login.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { Repository } from 'typeorm';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { Request } from 'express';




@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
  ) { }

  // Extrait la langue de l'en-tête Accept-Language (préférée)
  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'fr';
    const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
    const supported = ['fr', 'en', 'sw', 'es', 'ar'];
    return supported.includes(primary) ? primary : 'fr';
  }

  @Post('signup')
  async signup(
    @Body() body: any,
    @Req() req: Request,
  ): Promise<{
    message: string;
    data: Omit<UserEntity, 'password'> | { email?: string; phone?: string };
    access_token: string | null;
    refresh_token: string | null;
  }> {
    if (body.email === '') body.email = undefined;
    if (body.phone === '') body.phone = undefined;

    const lang = this.extractLanguage(req);
    return this.usersService.signup(body, lang);
  }

  @Post('signin')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async signin(@Body() loginUserDto: LoginUserDto, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    return await this.usersService.signin(loginUserDto, lang);
  }

  @Post('/google-login')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async googleLogin(@Body() dto: GoogleLoginDto, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    return this.usersService.googleLoginByClientData(dto, lang);
  }

  @Post('/apple-login')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async appleLogin(@Body() dto: AppleLoginDto, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    return this.usersService.appleLogin(dto, lang);
  }

  @Post('refresh-token')
  async refresh(
    @Body('refresh_token') refreshToken: string,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const tokens = await this.usersService.refreshTokenWithValidation(
      refreshToken,
      lang,
    );
    const message = await this.usersService['i18n'].translate('user.tokens_refreshed', lang);
    return {
      message,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    };
  }

  @UseGuards(AuthentificationGuard)
  @Get('generate-2fa')
  async generate2FA(
    @CurrentUser() currentUser: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const secret = this.usersService.generateSecret(currentUser.email);
    const qrCode = await this.usersService.generateQrCode(secret.otpauth_url);
    await this.usersService.set2FASecret(currentUser.id, secret.base32, lang);
    const token = speakeasy.totp({
      secret: secret.base32,
      encoding: 'base32',
    });
    const message = await this.usersService['i18n'].translate('user.2fa_generated', lang);
    return {
      message,
      qrCode,
      secret: secret.base32,
      token,
    };
  }

  @Post('verify')
  @UseGuards(AuthentificationGuard)
  async verify2FA(
    @Body() dto: Verify2FADto,
    @CurrentUser() currentUser: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const isValid = await this.usersService.verifyToken(
      currentUser.twoFASecret,
      dto.token,
      lang,
    );
    if (!isValid) throw new BadRequestException(await this.usersService['i18n'].translate('user.invalid_2fa_token', lang));
    await this.usersService.enable2FA(currentUser.id, lang);
    const message = await this.usersService['i18n'].translate('user.2fa_enabled', lang);
    return { message };
  }

  @UseGuards(AuthentificationGuard)
  @Patch('me')
  async updateUser(
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const user = await this.usersService.update(
      updateUserDto,
      currentUser,
      lang,
    );
    return classToPlain(user);
  }

  @UseGuards(AuthentificationGuard)
  @Patch('profile/image')
  @UseInterceptors(FileInterceptor('image'))
  async updateProfileImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.usersService.updateProfileImage(user.id, file, lang);
  }

  @UseGuards(AuthentificationGuard)
  @Get('me')
  async getProfile(
    @CurrentUser() currentUser: UserEntity,
    @Req() req: Request,
  ): Promise<{ data: Record<string, any> }> {
    if (!currentUser)
      throw new BadRequestException(await this.usersService['i18n'].translate('user.user_not_connected', this.extractLanguage(req)));
    const lang = this.extractLanguage(req);
    const fullUser = await this.usersService.getFullProfile(
      currentUser.id,
      lang,
    );
    return { data: fullUser };
  }

  @Get('referral/points')
  @UseGuards(AuthentificationGuard)
  async getReferralPoints(@CurrentUser() user: UserEntity, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    return this.usersService.getReferralPoints(user.id, lang);
  }

  @Post('forgot-password')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async forgotPassword(@Body() body: { email: string }, @Req() req: Request) {
    if (!body || !body.email)
      throw new BadRequestException(await this.usersService['i18n'].translate('user.email_required', this.extractLanguage(req)));
    const lang = this.extractLanguage(req);
    return await this.usersService.sendResetPasswordOtp(body.email, lang);
  }

  @Post('reset-password')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return await this.usersService.resetPassword(resetPasswordDto, lang);
  }

  @UseGuards(AuthentificationGuard)
  @Patch('me/change-password')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() currentUser: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return await this.usersService.changePassword(currentUser.id, dto, lang);
  }

  @Post('verify-otp')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async verifyOtpCode(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    if (!dto.email || !dto.otpCode)
      throw new BadRequestException(await this.usersService['i18n'].translate('user.email_and_otp_required', this.extractLanguage(req)));
    const lang = this.extractLanguage(req);
    return this.usersService.verifyOtp(dto.email, dto.otpCode, lang);
  }

  @UseGuards(AuthentificationGuard, AuthorizeGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @Get('all')
  async findAll(@Query('role') role?: string) {
    return await this.usersService.findAll(role);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    return this.usersService.findOne(id, lang);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    const result = await this.usersService.remove(id, lang);
    return result;
  }

  @Post('send')
  async sendEmail(@Req() req: Request) {
    const lang = this.extractLanguage(req);
    await this.mailService.sendHtmlEmail(
      'devmolomolo@gmail.com',
      'Bienvenue sur notre plateforme',
      'welcome.html',
    );
    const message = await this.usersService['i18n'].translate('user.email_sent', lang);
    return { message };
  }

  @Get('/get/all-users')
  async getAllUsers(@Req() req: Request) {
    const lang = this.extractLanguage(req);
    const users = await this.usersService.findAllWithDetails();
    const message = await this.usersService['i18n'].translate('user.users_list_retrieved', lang);
    return {
      message,
      data: users,
    };
  }

  @Patch(':id/user/active')
  @UseGuards(AuthentificationGuard)
  async setActiveStatus(@Param('id') id: string, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    return this.usersService.toggleUserActiveStatus(id, lang);
  }

  @Post('delete/own-account')
  @UseGuards(AuthentificationGuard)
  async deleteOwnAccount(
    @Body() dto: DeleteOwnAccountDto,
    @CurrentUser() currentUser: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const result = await this.usersService.deleteOwnAccount(
      currentUser.id,
      dto.password,
      lang,
    );
    return result;
  }

  @Patch('active-branch/:branchId')
  @UseGuards(AuthentificationGuard)
  async setActiveBranch(
    @Param('branchId') branchId: string,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    if (!branchId)
      throw new BadRequestException(await this.usersService['i18n'].translate('user.branch_id_required', lang));
    if (!user.activeCompanyId)
      throw new BadRequestException(await this.usersService['i18n'].translate('user.no_active_company', lang));
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, company_id: user.activeCompanyId },
    });
    if (!branch)
      throw new BadRequestException(await this.usersService['i18n'].translate('user.invalid_branch', lang));
    user.activeBranchId = branchId;
    await this.usersService.updateUserBranch(user.id, branchId, lang);
    const message = await this.usersService['i18n'].translate('user.active_branch_updated', lang);
    return {
      message,
      data: { activeBranchId: branchId, branchName: branch.name },
    };
  }

  @Post('device-token')
  @UseGuards(AuthentificationGuard)
  async registerToken(
    @Body('fcmToken') fcmToken: string,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.usersService.registerDeviceToken(user.id, fcmToken, lang);
  }

  @Get('settings/get')
  @UseGuards(AuthentificationGuard)
  async getMySettings(@CurrentUser() user: UserEntity, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    return this.usersService.getUserSettings(user.id, lang);
  }

  @Patch('settings')
  @UseGuards(AuthentificationGuard)
  async updateMySettings(
    @CurrentUser() user: UserEntity,
    @Body() dto: UpdateUserSettingsDto,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.usersService.updateUserSettings(user.id, dto, lang);
  }
}