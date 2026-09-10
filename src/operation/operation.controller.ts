import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { OperationService } from './operation.service';
import { UpdateOperationStatusDto } from './dto/update-operation-status.dto';
import { OperationStatus } from './enum/operation.status.enum';
import { PaymentMethod } from './enum/payment-method.enum';

@Controller('operations')
export class OperationController {
  constructor(private readonly operationService: OperationService) {}

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('userId') userId?: string,
    @Query('status') status?: OperationStatus,
    @Query('paymentMethod') paymentMethod?: PaymentMethod,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.operationService.findAll(page, limit, {
      userId,
      status,
      paymentMethod,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.operationService.findOne(id);
  }

  @Get('user/:userId')
  findByUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.operationService.findByUser(userId);
  }

  @Get('shipment/:shipmentId')
  findByShipment(@Param('shipmentId', ParseUUIDPipe) shipmentId: string) {
    return this.operationService.findByShipment(shipmentId);
  }

  @Get('hotel-reservation/:hotelReservationId')
  findByHotelReservation(@Param('hotelReservationId', ParseUUIDPipe) hotelReservationId: string) {
    return this.operationService.findByHotelReservation(hotelReservationId);
  }

  @Get('reservation/:reservationId')
  findByReservation(@Param('reservationId', ParseUUIDPipe) reservationId: string) {
    return this.operationService.findByReservation(reservationId);
  }

  @Get('balance/:userId')
  getUserBalance(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.operationService.getUserBalance(userId);
  }

  @Get('statistics')
  getStatistics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.operationService.getStatistics(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOperationStatusDto,
  ) {
    return this.operationService.updateStatus(id, dto);
  }

  @Patch(':id/cancel')
  cancelOperation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
  ) {
    return this.operationService.cancelOperation(id, reason);
  }

  @Delete(':id')
  deleteOperation(@Param('id', ParseUUIDPipe) id: string) {
    return this.operationService.deleteOperation(id);
  }
}