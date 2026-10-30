// src/contracts/contracts.controller.ts
import {
    BadRequestException,
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
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
    constructor(private readonly contractsService: ContractsService) {}

    private extractLanguage(req: Request): string {
        const acceptLanguage = req.headers['accept-language'];
        if (!acceptLanguage) return 'fr';
        const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
        const supported = ['fr', 'en', 'sw', 'es', 'ar'];
        return supported.includes(primary) ? primary : 'fr';
    }

    private static readonly fileInterceptorOptions = {
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (req: any, file: Express.Multer.File, cb: any) => {
            const allowed = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            ];
            if (allowed.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(
                    new BadRequestException(
                        'Format non autorisé. Acceptés : PDF, DOC, DOCX',
                    ),
                    false,
                );
            }
        },
    };

    // CREATE
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @UseInterceptors(
        FileInterceptor('file', ContractsController.fileInterceptorOptions),
    )
    create(
        @Body() dto: CreateContractDto,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.contractsService.create(dto, lang, file);
    }

    // LIST
    @Get()
    async findAll(
        @Req() req: Request,
        @Query('status') status?: string,
        @Query('customerId') customerId?: string,
        @Query('prospectId') prospectId?: string,
        @Query('managerId') managerId?: string,
        @Query('company') company?: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '10',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<ContractEntity>;
    }> {
        const lang = this.extractLanguage(req);
        return this.contractsService.findAll(
            {
                status,
                customerId,
                prospectId,
                managerId,
                company,
                page: Number(page),
                limit: Number(limit),
            },
            lang,
        );
    }

    // EXPIRING (déclaré AVANT :id)
    @Get('expiring')
    expiring(@Req() req: Request, @Query('days') days: string = '30') {
        const lang = this.extractLanguage(req);
        return this.contractsService.findExpiring(Number(days) || 30, lang);
    }

    // FIND ONE
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.contractsService.findOne(id, lang);
    }

    // UPDATE
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateContractDto,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.contractsService.update(id, dto, lang);
    }

    // REPLACE DOCUMENT
    @Patch(':id/document')
    @UseInterceptors(
        FileInterceptor('file', ContractsController.fileInterceptorOptions),
    )
    updateDocument(
        @Param('id', ParseUUIDPipe) id: string,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.contractsService.updateDocument(id, lang, file);
    }

    // APPROVE
    @Patch(':id/approve')
    approve(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() body: { approvedById: string },
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.contractsService.approve(id, body.approvedById, lang);
    }

    // SIGN
    @Patch(':id/sign')
    sign(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() body: { signedBy: string },
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.contractsService.sign(id, body.signedBy, lang);
    }

    // DELETE
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const lang = this.extractLanguage(req);
        return this.contractsService.remove(id, lang);
    }
}