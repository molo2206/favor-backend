// src/lta/lta.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpStatus,
  HttpCode,
  Patch,
  UseGuards,
  NotFoundException,
  Res,
  Query,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { LtaService, ApiResponse } from './lta.service';
import { CreateLtaDto, UpdateLtaDto } from './dto/create-lta.dto';
import { ShipmentStatus } from '../enum/shipment.dto';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { UpdateTrackingCompletedDto } from './dto/update-track-lta.dto';
import { LtaEntity } from './entity/lta.entity';
import { Response, Request } from 'express';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { I18nService } from 'src/libs/common/src';

export class ChangeStatusDto {
  newStatus: ShipmentStatus;
}

@Controller('lta')
export class LtaController {
  constructor(
    private readonly ltaService: LtaService,
    private readonly i18n: I18nService,
  ) { }

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'fr';
    const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
    const supported = ['fr', 'en', 'sw', 'es','ar'];
    return supported.includes(primary) ? primary : 'fr';
  }

  @Post()
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.CREATE, 'lta')
  @HttpCode(HttpStatus.CREATED)
  async createLta(
    @Body() createLtaDto: CreateLtaDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ): Promise<ApiResponse> {
    const lang = this.extractLanguage(req);
    return this.ltaService.createLta(createLtaDto, user, lang);
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'lta')
  async getAllLtas(
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ): Promise<any> {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('lta.no_active_company', lang),
      );
    }

    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    const validPage = pageNumber > 0 ? pageNumber : 1;
    const validLimit = limitNumber > 0 && limitNumber <= 100 ? limitNumber : 10;

    return this.ltaService.getAllLtas(
      user,
      validPage,
      validLimit,
      search,
      type,
      status,
      lang,
    );
  }

  @Get('stats')
  async getLtaStats(@Req() req: Request): Promise<ApiResponse> {
    const lang = this.extractLanguage(req);
    return this.ltaService.getLtaStats(lang);
  }

  @Get(':id')
  @UseGuards(AuthentificationGuard)
  async getLtaById(
    @Param('id') id: string,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ): Promise<ApiResponse> {
    const lang = this.extractLanguage(req);
    return this.ltaService.getLtaById(id, user, lang);
  }

  @Get('number/:ltaNumber')
  async getLtaByNumber(
    @Param('ltaNumber') ltaNumber: string,
    @Req() req: Request,
  ): Promise<ApiResponse> {
    const lang = this.extractLanguage(req);
    return this.ltaService.getLtaByNumber(ltaNumber, lang);
  }

  @Get('company')
  @UseGuards(AuthentificationGuard)
  async getLtasByCompany(
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ): Promise<ApiResponse> {
    const lang = this.extractLanguage(req);
    return this.ltaService.getLtasByCompany(user, lang);
  }

  @Get('search/:searchTerm')
  @UseGuards(AuthentificationGuard)
  async searchLtas(
    @Param('searchTerm') searchTerm: string,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ): Promise<ApiResponse> {
    const lang = this.extractLanguage(req);
    return this.ltaService.searchLtas(searchTerm, user, lang);
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'lta')
  async updateLta(
    @Param('id') id: string,
    @Body() updateLtaDto: UpdateLtaDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ): Promise<ApiResponse> {
    const lang = this.extractLanguage(req);
    return this.ltaService.updateLta(id, updateLtaDto, user, lang);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteLta(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<ApiResponse> {
    const lang = this.extractLanguage(req);
    return this.ltaService.deleteLta(id, lang);
  }

  @Patch(':id/souslta/status')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'lta')
  @HttpCode(HttpStatus.OK)
  async changeStatus(
    @Param('id') id: string,
    @Body() changeStatusDto: ChangeStatusDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ): Promise<{ message: string; data: LtaEntity }> {
    const lang = this.extractLanguage(req);
    const { newStatus } = changeStatusDto;
    const result = await this.ltaService.changeStatus(id, newStatus, user, lang);
    return result;
  }

  @Patch('tracking/:id/completed')
  @UseGuards(AuthentificationGuard)
  async updateCompleted(
    @Param('id') id: string,
    @Body() dto: UpdateTrackingCompletedDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const lang = this.extractLanguage(req);
    const result = await this.ltaService.updateTrackingCompleted(
      id,
      dto.completed,
      user,
      lang,
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  }

  @Get(':id/balance')
  async getLtaBalance(
    @Param('id') ltaId: string,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const balance = await this.ltaService.getLtaBalance(ltaId, lang);

    if (!balance) {
      throw new NotFoundException(
        await this.i18n.translate('lta.not_found_id', lang, { id: ltaId }),
      );
    }

    return balance;
  }

  @Get(':id/balance-with-history')
  async getBalanceWithHistory(
    @Param('id') ltaId: string,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.ltaService.getLtaBalanceWithHistory(ltaId, lang);
  }
}