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
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { CustomerEntity } from './entities/customer.entity';

@Controller('commercial/customers')
@UseGuards(AuthentificationGuard)
export class CustomersController {
    constructor(private readonly customersService: CustomersService) { }

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
    // ➕ CRÉER UN CLIENT
    // ============================================================
    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: CreateCustomerDto, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.customersService.create(dto, lang);
    }

    // ============================================================
    // 📋 LISTER LES CLIENTS
    // ============================================================
    @Get()
    async findAll(
        @Req() req: Request,
        @Query() query: QueryCustomerDto,
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<CustomerEntity>;
    }> {
        const lang = this.extractLanguage(req);
        return this.customersService.findAll(query, lang);
    }

    // ============================================================
    // 🔍 TROUVER UN CLIENT PAR userId
    // ============================================================
    @Get('user/:userId')
    findByUserId(
        @Param('userId', ParseUUIDPipe) userId: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.customersService.findByUserId(userId, lang);
    }

    // ============================================================
    // 🔍 VOIR UN CLIENT
    // ============================================================
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.customersService.findOne(id, lang);
    }

    // ============================================================
    // ✏️ MODIFIER UN CLIENT
    // ============================================================
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateCustomerDto,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.customersService.update(id, dto, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN CLIENT
    // ============================================================
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.customersService.remove(id, lang);
    }
}