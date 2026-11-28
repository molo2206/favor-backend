import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { ServiceClientContactsService } from './contacts.service';
import { ContactStatusDto, MarkContactedDto, UpsertObjectiveDto } from './dto/contacts.dto';

/**
 * Service client : objectifs de contact (critères + périodicité), disponibilisation LTA,
 * et suivi dynamique « contacté + note » (par objectif et par période).
 */
@Controller('service-client')
@UseGuards(AuthentificationGuard)
export class ServiceClientContactsController {
  constructor(private readonly contacts: ServiceClientContactsService) {}

  // ---- Objectifs ----
  @Post('objectives')
  createObjective(@Body() dto: UpsertObjectiveDto, @CurrentUser() user: UserEntity) {
    return this.contacts.createObjective(dto, user.id);
  }

  @Get('objectives')
  listObjectives(@Query('onlyActive') onlyActive?: string) {
    return this.contacts.listObjectives(['true', '1', 'yes'].includes(String(onlyActive ?? '').toLowerCase()));
  }

  @Get('objectives/:id')
  getObjective(@Param('id') id: string) {
    return this.contacts.getObjective(id);
  }

  /** Avancement de l'objectif pour la période en cours (contactés vs cible + filtres à appliquer) */
  @Get('objectives/:id/progress')
  progress(@Param('id') id: string) {
    return this.contacts.objectiveProgress(id);
  }

  @Patch('objectives/:id')
  updateObjective(@Param('id') id: string, @Body() dto: UpsertObjectiveDto) {
    return this.contacts.updateObjective(id, dto);
  }

  @Delete('objectives/:id')
  deleteObjective(@Param('id') id: string) {
    return this.contacts.deleteObjective(id);
  }

  // ---- Disponibilisation LTA ----
  @Patch('lta/:id/release')
  release(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.contacts.releaseLta(id, user.id, true);
  }

  @Patch('lta/:id/unrelease')
  unrelease(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.contacts.releaseLta(id, user.id, false);
  }

  @Get('lta/available')
  availableLtas(
    @Query('destination') destination?: string,
    @Query('country') country?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.contacts.availableLtas({ destination, country, search, page: Number(page) || 1, limit: Number(limit) || 20 });
  }

  // ---- Suivi des contacts ----
  @Post('contacts')
  mark(@Body() dto: MarkContactedDto, @CurrentUser() user: UserEntity) {
    return this.contacts.markContacted(dto, user.id);
  }

  @Post('contacts/status')
  status(@Body() dto: ContactStatusDto) {
    return this.contacts.statusForClients(dto);
  }

  @Get('contacts/client/:clientUserId')
  history(@Param('clientUserId') clientUserId: string) {
    return this.contacts.listForClient(clientUserId);
  }
}
