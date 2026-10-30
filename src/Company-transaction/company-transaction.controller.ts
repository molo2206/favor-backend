// src/company/controllers/company-transaction.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { UserRole } from 'src/users/enum/user-role-enum';
import { CompanyTransactionService } from './company-transaction.service';
import { CreateCompanyTransactionDto } from './dto/create-company-transaction.dto';
import {
  TransactionStatus,
  TransactionType,
} from './entity/company-transaction.entity';
import { UpdateCompanyTransactionDto } from './dto/update-company-transaction.dto';

@Controller('company/transactions')
@UseGuards(AuthentificationGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class CompanyTransactionController {
  constructor(private readonly transactionService: CompanyTransactionService) {}

  @Post()
  @AuthorizeRoles(UserRole.ADMIN)
  async create(@Body() dto: CreateCompanyTransactionDto) {
    return this.transactionService.create(dto);
  }

  @Get()
  async findAll(
    @Query('companyId') companyId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('type') type?: TransactionType,
    @Query('status') status?: TransactionStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.transactionService.findAll(
      companyId,
      Number(page),
      Number(limit),
      type,
      status,
      start,
      end,
    );
  }

  @Get('balance')
  async getCompanyBalance(@CurrentUser() user: UserEntity) {
    if (!user.activeCompanyId) {
      return { balance: 0, totalDebit: 0, totalCredit: 0 };
    }
    return this.transactionService.getCompanyBalance(user.activeCompanyId);
  }

  @Get('period')
  async getTransactionsByPeriod(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: UserEntity,
  ) {
    if (!user.activeCompanyId) {
      return { data: [], total: 0 };
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    return this.transactionService.getCompanyTransactionsByPeriod(
      user.activeCompanyId,
      start,
      end,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.transactionService.findOne(id);
  }

  @Patch(':id')
  @AuthorizeRoles(UserRole.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyTransactionDto,
  ) {
    return this.transactionService.update(id, dto);
  }

  @Patch(':id/status')
  @AuthorizeRoles(UserRole.ADMIN)
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: TransactionStatus,
  ) {
    return this.transactionService.updateStatus(id, status);
  }

  @Patch(':id/paid')
  @AuthorizeRoles(UserRole.ADMIN)
  async updatePaid(@Param('id') id: string, @Body('paid') paid: boolean) {
    return this.transactionService.updatePaidStatus(id, paid);
  }

  @Delete(':id')
  @AuthorizeRoles(UserRole.ADMIN)
  async remove(@Param('id') id: string) {
    return this.transactionService.remove(id);
  }
}
