import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { langFrom } from '../common/logistics-access';
import { FleetService } from './fleet.service';
import {
  AssignDriverDto,
  CancelDto,
  CompleteMaintenanceDto,
  CompleteMissionDto,
  CreateDocumentDto,
  CreateFuelLogDto,
  CreateMaintenanceDto,
  CreateMissionDto,
  CreateVehicleDto,
  DocumentQueryDto,
  FuelQueryDto,
  MaintenanceQueryDto,
  MissionQueryDto,
  StartMissionDto,
  UpdateDocumentDto,
  UpdateVehicleDto,
  VehicleQueryDto,
} from './dto/fleet.dto';

/**
 * BackOffice — Charroi = tout le matériel roulant (voitures, camions, bus, motos, tricycles, vélos).
 * ✅ Image (multipart, champ `image`) : engin, mission, reçu de carburant, entretien, document (image ou PDF).
 * Préfixe : /backoffice/fleet
 */
@Controller('backoffice/fleet')
@UseGuards(AuthentificationGuard)
export class FleetController {
  constructor(private readonly service: FleetService) { }

  // ---------- Tableau de bord ----------
  @Get('dashboard')
  dashboard(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.service.dashboard(user, langFrom(req), companyId);
  }

  // ---------- Véhicules ----------
  @Post('vehicles')
  @AuditAction(ActionType.CREATE, 'fleet_vehicle')
  @UseInterceptors(FileInterceptor('image'))
  createVehicle(@Req() req: Request, @Body() dto: CreateVehicleDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.createVehicle(dto, file, user, langFrom(req));
  }

  @Get('vehicles')
  listVehicles(@Req() req: Request, @Query() query: VehicleQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.listVehicles(query, user, langFrom(req));
  }

  @Get('vehicles/:id')
  vehicleDetail(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.vehicleDetail(id, user, langFrom(req));
  }

  @Patch('vehicles/:id')
  @AuditAction(ActionType.UPDATE, 'fleet_vehicle')
  @UseInterceptors(FileInterceptor('image'))
  updateVehicle(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.updateVehicle(id, dto, file, user, langFrom(req));
  }

  @Patch('vehicles/:id/driver')
  @AuditAction(ActionType.UPDATE, 'fleet_vehicle')
  assignDriver(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDriverDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.assignDriver(id, dto, user, langFrom(req));
  }

  @Post('vehicles/:id/retire')
  @AuditAction(ActionType.UPDATE, 'fleet_vehicle')
  retireVehicle(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.retireVehicle(id, user, langFrom(req));
  }

  // ---------- Missions ----------
  @Post('missions')
  @AuditAction(ActionType.CREATE, 'fleet_mission')
  @UseInterceptors(FileInterceptor('image'))
  createMission(@Req() req: Request, @Body() dto: CreateMissionDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.createMission(dto, file, user, langFrom(req));
  }

  @Get('missions')
  listMissions(@Req() req: Request, @Query() query: MissionQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.listMissions(query, user, langFrom(req));
  }

  @Post('missions/:id/start')
  @AuditAction(ActionType.UPDATE, 'fleet_mission')
  startMission(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartMissionDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.startMission(id, dto, user, langFrom(req));
  }

  @Post('missions/:id/complete')
  @AuditAction(ActionType.UPDATE, 'fleet_mission')
  @UseInterceptors(FileInterceptor('image'))
  completeMission(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteMissionDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.completeMission(id, dto, file, user, langFrom(req));
  }

  @Post('missions/:id/cancel')
  @AuditAction(ActionType.UPDATE, 'fleet_mission')
  cancelMission(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.cancelMission(id, dto, user, langFrom(req));
  }

  // ---------- Carburant ----------
  @Post('fuel')
  @AuditAction(ActionType.CREATE, 'fleet_fuel')
  @UseInterceptors(FileInterceptor('image'))
  addFuel(@Req() req: Request, @Body() dto: CreateFuelLogDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.addFuel(dto, file, user, langFrom(req));
  }

  @Get('fuel')
  listFuel(@Req() req: Request, @Query() query: FuelQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.listFuel(query, user, langFrom(req));
  }

  @Delete('fuel/:id')
  @AuditAction(ActionType.DELETE, 'fleet_fuel')
  deleteFuel(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.deleteFuel(id, user, langFrom(req));
  }

  // ---------- Entretien ----------
  @Post('maintenance')
  @AuditAction(ActionType.CREATE, 'fleet_maintenance')
  @UseInterceptors(FileInterceptor('image'))
  createMaintenance(@Req() req: Request, @Body() dto: CreateMaintenanceDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.createMaintenance(dto, file, user, langFrom(req));
  }

  @Get('maintenance')
  listMaintenance(@Req() req: Request, @Query() query: MaintenanceQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.listMaintenance(query, user, langFrom(req));
  }

  @Post('maintenance/:id/start')
  @AuditAction(ActionType.UPDATE, 'fleet_maintenance')
  startMaintenance(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.startMaintenance(id, user, langFrom(req));
  }

  @Post('maintenance/:id/complete')
  @AuditAction(ActionType.UPDATE, 'fleet_maintenance')
  @UseInterceptors(FileInterceptor('image'))
  completeMaintenance(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteMaintenanceDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.completeMaintenance(id, dto, file, user, langFrom(req));
  }

  @Post('maintenance/:id/cancel')
  @AuditAction(ActionType.UPDATE, 'fleet_maintenance')
  cancelMaintenance(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.cancelMaintenance(id, dto, user, langFrom(req));
  }

  // ---------- Documents (assurance, contrôle technique…) ----------
  @Post('documents')
  @AuditAction(ActionType.CREATE, 'fleet_document')
  @UseInterceptors(FileInterceptor('image'))
  createDocument(@Req() req: Request, @Body() dto: CreateDocumentDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.createDocument(dto, file, user, langFrom(req));
  }

  @Get('documents')
  listDocuments(@Req() req: Request, @Query() query: DocumentQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.listDocuments(query, user, langFrom(req));
  }

  @Patch('documents/:id')
  @AuditAction(ActionType.UPDATE, 'fleet_document')
  @UseInterceptors(FileInterceptor('image'))
  updateDocument(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.updateDocument(id, dto, file, user, langFrom(req));
  }

  @Delete('documents/:id')
  @AuditAction(ActionType.DELETE, 'fleet_document')
  deleteDocument(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.deleteDocument(id, user, langFrom(req));
  }
}
