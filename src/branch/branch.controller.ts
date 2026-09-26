import { CompanyActivity } from './../company/enum/activity.company.enum';
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Patch,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { BranchService } from './branch.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/create-branch.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';

@Controller('branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Get()
  @UseGuards(AuthentificationGuard)
  async findAll(@CurrentUser() user: UserEntity) {
    const activeCompanyId = user.activeCompanyId;
    if (!activeCompanyId) {
      // Option 1 : retourner une liste vide
      return { message: 'Aucune entreprise active', data: [] };
      // Option 2 : lever une exception (à vous de choisir)
      // throw new BadRequestException('Aucune entreprise active pour cet utilisateur');
    }
    return this.branchService.findAll(activeCompanyId);
  }

  @Get(':id')
  @UseGuards(AuthentificationGuard)
  async findOne(@Param('id') id: string) {
    return this.branchService.findOne(id);
  }

  @Post()
  @UseGuards(AuthentificationGuard)
  async create(@Body() dto: CreateBranchDto, @CurrentUser() user: UserEntity) {
    const activeCompanyId = user.activeCompanyId;
    if (!activeCompanyId) {
      throw new BadRequestException(
        'Aucune entreprise active pour cet utilisateur',
      );
    }
    return this.branchService.create(dto, activeCompanyId);
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.branchService.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(AuthentificationGuard)
  async softDelete(@Param('id') id: string) {
    return this.branchService.softDelete(id);
  }
}
