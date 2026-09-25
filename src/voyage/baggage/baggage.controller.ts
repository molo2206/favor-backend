// baggage.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { BaggageService } from './baggage.service';
import { CreateBaggageDto } from './dto/create-baggage.dto';
import { UpdateBaggageDto } from './dto/update-baggage.dto';
import { Baggage } from './entities/baggage.entity';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { VehicleBaggageRule } from '../baggage-rules/entities/baggage-rule.entity';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';

@Controller('baggage')
@UseGuards(AuthentificationGuard)
export class BaggageController {
  constructor(private readonly baggageService: BaggageService) { }

  @Get()
  async findAll(): Promise<{ message: string; data: Baggage[] }> {
    const data = await this.baggageService.findAll();
    return { message: 'Liste des bagages', data };
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string; data: Baggage }> {
    const data = await this.baggageService.findOne(id);
    return { message: 'Bagage trouvé', data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createDto: CreateBaggageDto,
  ): Promise<{ message: string; data: Baggage }> {
    const data = await this.baggageService.create(createDto);
    return { message: 'Bagage ajouté avec succès', data };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateBaggageDto,
  ): Promise<{ message: string; data: Baggage }> {
    const data = await this.baggageService.update(id, updateDto);
    return { message: 'Bagage mis à jour', data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.baggageService.remove(id);
    return { message: 'Bagage supprimé avec succès' };
  }

  @Get('reservation/:reservationId')
  async findByReservation(
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
  ): Promise<{ message: string; data: Baggage[] }> {
    const data = await this.baggageService.findAllByReservation(reservationId);
    return { message: 'Liste des bagages de la réservation', data };
  }

  @Get('reservation/:reservationId/total-fee')
  async getTotalExtraFee(
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
  ): Promise<{ message: string; total: number }> {
    const total =
      await this.baggageService.calculateTotalExtraFee(reservationId);
    return { message: 'Total des frais supplémentaires', total };
  }

  // ==================== BAGGAGE RULES ====================

  @Get('rules/all')
  async getAllRules(
    @CurrentUser() user: UserEntity,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('vehicleType') vehicleType?: string,
  ): Promise<{
    message: string;
    data: {
      data: VehicleBaggageRule[];
      total: number;
      page: number;
      limit: number;
    };
  }> {
    const result = await this.baggageService.getAllBaggageRules(
      user,
      page,
      limit,
      vehicleType,
    );
    return {
      message: 'Liste des règles de bagages',
      data: {
        data: result.data,
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  }

  @Get('rules/vehicle/:vehicleType')
  async getRulesByVehicleType(
    @Param('vehicleType') vehicleType: string,
    @CurrentUser() user: UserEntity,
  ): Promise<{ message: string; data: VehicleBaggageRule }> {
    const data = await this.baggageService.getBaggageRulesByVehicleType(vehicleType, user);
    return { message: 'Règle de bagage trouvée', data };
  }

  @Post('rules')
  async createRule(
    @Body() ruleData: Partial<VehicleBaggageRule>,
    @CurrentUser() user: UserEntity,
  ): Promise<{ message: string; data: VehicleBaggageRule }> {
    const data = await this.baggageService.createBaggageRule(ruleData, user);
    return { message: 'Règle de bagage créée avec succès', data };
  }

  @Patch('rules/:id')
  async updateRule(
    @Param('id') id: string,
    @Body() ruleData: Partial<VehicleBaggageRule>,
    @CurrentUser() user: UserEntity,
  ): Promise<{ message: string; data: VehicleBaggageRule }> {
    const data = await this.baggageService.updateBaggageRule(id, ruleData, user);
    return { message: 'Règle de bagage mise à jour avec succès', data };
  }

  @Delete('rules/:id')
  async removeRule(
    @Param('id') id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<{ message: string }> {
    await this.baggageService.removeBaggageRule(id, user);
    return { message: 'Règle de bagage supprimée avec succès' };
  }

  @Get('rules/:id')
  @UseGuards(AuthentificationGuard)
  async getBaggageRuleById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<{
    message: string;
    data: VehicleBaggageRule;
  }> {
    const data = await this.baggageService.getBaggageRuleById(id, user);
    return {
      message: 'Règle de bagage trouvée',
      data,
    };
  }
}
