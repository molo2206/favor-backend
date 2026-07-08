import {
  Controller,
  Post,
  Patch,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
  ParseUUIDPipe,
  NotFoundException,
  ValidationPipe,
  UsePipes,
  UploadedFile,
  Query,
  Req,
} from '@nestjs/common';
import { ShipmentService } from './shipment.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { ShipmentPriceDto } from './dto/createShipmentPrice.dto';
import { Shipment } from './entity/shipment.entity';
import { CreateShipmentAdminDto } from './dto/create-shipment.admin.dto';
import { UpdateShipmentAdminDto } from './dto/update-shipment.admin.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { CollectShipmentBodyDto } from './dto/collect-shipment-body.dto';
import { CollectShipmentResponseDto } from './dto/collect-shipment-response.dto';
import { ConfirmPinDto } from './dto/confirmPinDto.dto';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { CollectShipmentBodyAdminDto } from './dto/collect-shipment-bodyAdmin.dto';
import { CompanyPermissionsGuard } from 'src/users/utility/guards/company-permissions.guard';
import { Permissions } from 'src/users/utility/guards/permissions.guard';
import { I18nService } from 'src/libs/common/src';
import { Request } from 'express';

@Controller('shipments')
@UseInterceptors(ClassSerializerInterceptor)
export class ShipmentController {
  constructor(
    private readonly shipmentService: ShipmentService,
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
  @AuditAction(ActionType.CREATE, 'shipments')
  async createShipment(
    @Body() createShipmentDto: CreateShipmentDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const result = await this.shipmentService.create(createShipmentDto, user, lang);
    return {
      message: result.message,
      data: result.data,
    };
  }

  @Post('admin')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.CREATE, 'shipments')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @UseInterceptors(FileInterceptor('image'))
  async createShipmentByAdmin(
    @Body() dto: CreateShipmentAdminDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const result = await this.shipmentService.createByAdmin(dto, file, user, lang);
    return { message: result.message, data: result.data };
  }

  @Patch('admin/:id')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'shipments')
  @UseInterceptors(FileInterceptor('image'))
  async updateShipmentAdmin(
    @Param('id') id: string,
    @Body() dto: UpdateShipmentAdminDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.shipmentService.updateByAdmin(id, dto, file, lang);
  }

  @Get('my')
  @UseGuards(AuthentificationGuard)
  async findAllByUser(
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const shipments = await this.shipmentService.findAllByUser(user.id, lang);
    return {
      message: await this.i18n.translate('shipment.controller.my_shipments_success', lang),
      data: shipments,
    };
  }

  @Patch(':id/prices')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'shipments')
  async updateShipmentPrices(
    @Param('id') shipmentId: string,
    @Body() priceDto: ShipmentPriceDto,
    @Req() req: Request,
  ): Promise<{ message: string; data: any }> {
    const lang = this.extractLanguage(req);
    const result = await this.shipmentService.updateShipmentPrices(shipmentId, priceDto, lang);
    if (!result) {
      throw new NotFoundException(await this.i18n.translate('shipment.error.not_found', lang, { id: shipmentId }));
    }
    return result;
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  async findAll(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    const lang = this.extractLanguage(req);
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    const validPage = pageNumber > 0 ? pageNumber : 1;
    const validLimit = limitNumber > 0 && limitNumber <= 100 ? limitNumber : 10;
    return this.shipmentService.findAll(
      user,
      validPage,
      validLimit,
      search,
      type,
      status,
      lang,
    );
  }

  @Get('all/without-lta')
  @UseGuards(AuthentificationGuard)
  async findAllWithoutLta(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('ltaId') ltaId?: string,
  ) {
    const lang = this.extractLanguage(req);
    const shipments = await this.shipmentService.findAllWithoutLta(user, ltaId, lang);
    return {
      message: await this.i18n.translate('shipment.controller.without_lta_success', lang),
      data: shipments,
    };
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const shipment = await this.shipmentService.findOne(id, lang);
    return {
      message: await this.i18n.translate('shipment.controller.find_one_success', lang),
      data: shipment,
    };
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'shipments')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateShipmentDto: UpdateShipmentDto,
    @CurrentUser() currentUser: UserEntity,
    @Req() req: Request,
  ): Promise<{ message: string; data: Shipment }> {
    const lang = this.extractLanguage(req);
    const shipment = await this.shipmentService.update(id, updateShipmentDto, currentUser, lang);
    return {
      message: await this.i18n.translate('shipment.controller.update_success', lang),
      data: shipment,
    };
  }

  @Delete(':id')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.DELETE, 'shipments')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const result = await this.shipmentService.remove(id, lang);
    return {
      message: result.message,
    };
  }

  @Post(':id/collect')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.CREATE, 'shipments retrait coli')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async collectShipment(
    @Param('id') shipmentId: string,
    @CurrentUser() user: UserEntity,
    @Body() body: CollectShipmentBodyDto,
    @Req() req: Request,
  ): Promise<{ message: string; data: CollectShipmentResponseDto }> {
    const lang = this.extractLanguage(req);
    const result = await this.shipmentService.collectShipment(shipmentId, user, body, lang);
    return {
      message: await this.i18n.translate('shipment.controller.collect_success', lang),
      data: result,
    };
  }

  @Post(':id/collect/admin')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.CREATE, 'shipments retrait coli')
  async collectShipmentAdmin(
    @Param('id') shipmentId: string,
    @CurrentUser() user: UserEntity,
    @Body() body: CollectShipmentBodyAdminDto,
    @Req() req: Request,
  ): Promise<CollectShipmentResponseDto> {
    const lang = this.extractLanguage(req);
    return this.shipmentService.collectShipmentAdmin(shipmentId, user, body, lang);
  }

  @Patch('confirmer/coli-payer')
  @UseGuards(AuthentificationGuard, CompanyPermissionsGuard)
  @Permissions({ resource: 'RETRAITS', action: 'canManage' })
  @AuditAction(ActionType.UPDATE, 'shipments')
  async confirmerColisRecuperer(
    @CurrentUser() user: UserEntity,
    @Body() body: ConfirmPinDto,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const data = await this.shipmentService.confirmPickupByPin(body.pin, user, lang);
    return {
      success: true,
      message: data.message,
      data: data.shipment ?? null,
    };
  }

  @Get('all/by-agent')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'shipments')
  async findAllByUserAssign(
    @CurrentUser() user: UserEntity,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 5,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const shipments = await this.shipmentService.findAllByUserAssign(user.id, Number(page), Number(limit), lang);
    return {
      message: await this.i18n.translate('shipment.controller.by_agent_success', lang),
      data: shipments,
    };
  }
}