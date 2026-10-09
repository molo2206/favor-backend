import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { ContractEntity } from './entities/contract.entity';

@Controller('commercial/contracts')
@UseGuards(AuthentificationGuard)
export class ContractsController {
    constructor(private readonly contractsService: ContractsService) { }

    // ============================================================
    // 🌍 EXTRACTION DE LA LANGUE
    // ============================================================
    private extractLanguage(req: Request): string {
        const acceptLanguage = req.headers['accept-language'];
        if (!acceptLanguage) return 'fr';
        const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
        const supported = ['fr', 'en', 'sw', 'es', 'ar'];
        return supported.includes(primary) ? primary : 'fr';
    }

    // ============================================================
    // ➕ CRÉER UN CONTRAT
    // ============================================================
    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: CreateContractDto, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.contractsService.create(dto, lang);
    }

    // ============================================================
    // 📋 LISTER LES CONTRATS
    // ============================================================
    @Get()
    async findAll(
        @Req() req: Request,
        @Query('status') status?: string,
        @Query('customerId') customerId?: string,
        @Query('managerId') managerId?: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '10',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<ContractEntity>;
    }> {
        const lang = this.extractLanguage(req);
        return this.contractsService.findAll(
            status,
            customerId,
            managerId,
            Number(page),
            Number(limit),
            lang,
        );
    }

    // ============================================================
    // ⏰ CONTRATS EXPIRANT BIENTÔT
    // ============================================================
    @Get('expiring')
    expiring(
        @Req() req: Request,
        @Query('days') days: string = '30',
    ) {
        const lang = this.extractLanguage(req);
        return this.contractsService.findExpiring(Number(days) || 30, lang);
    }

    // ============================================================
    // 🔍 VOIR UN CONTRAT
    // ============================================================
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.contractsService.findOne(id, lang);
    }

    // ============================================================
    // ✏️ MODIFIER UN CONTRAT
    // ============================================================
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateContractDto,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.contractsService.update(id, dto, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN CONTRAT
    // ============================================================
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.contractsService.remove(id, lang);
    }
}