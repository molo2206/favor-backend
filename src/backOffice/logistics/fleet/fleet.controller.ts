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
  UseGuards,
} from '@nestjs/common';
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
 * BackOffice — Charroi (parc de véhicules de l'entreprise).
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
  createVehicle(@Req() req: Request, @Body() dto: CreateVehicleDto, @CurrentUser() user: UserEntity) {
    return this.service.createVehicle(dto, user, langFrom(req));
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
  updateVehicle(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.updateVehicle(id, dto, user, langFrom(req));
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
  createMission(@Req() req: Request, @Body() dto: CreateMissionDto, @CurrentUser() user: UserEntity) {
    return this.service.createMission(dto, user, langFrom(req));
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
  completeMission(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteMissionDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.completeMission(id, dto, user, langFrom(req));
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
  addFuel(@Req() req: Request, @Body() dto: CreateFuelLogDto, @CurrentUser() user: UserEntity) {
    return this.service.addFuel(dto, user, langFrom(req));
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
  createMaintenance(@Req() req: Request, @Body() dto: CreateMaintenanceDto, @CurrentUser() user: UserEntity) {
    return this.service.createMaintenance(dto, user, langFrom(req));
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
  completeMaintenance(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteMaintenanceDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.completeMaintenance(id, dto, user, langFrom(req));
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
  createDocument(@Req() req: Request, @Body() dto: CreateDocumentDto, @CurrentUser() user: UserEntity) {
    return this.service.createDocument(dto, user, langFrom(req));
  }

  @Get('documents')
  listDocuments(@Req() req: Request, @Query() query: DocumentQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.listDocuments(query, user, langFrom(req));
  }

  @Patch('documents/:id')
  @AuditAction(ActionType.UPDATE, 'fleet_document')
  updateDocument(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.updateDocument(id, dto, user, langFrom(req));
  }

  @Delete('documents/:id')
  @AuditAction(ActionType.DELETE, 'fleet_document')
  deleteDocument(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.deleteDocument(id, user, langFrom(req));
  }
}
