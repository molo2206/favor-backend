import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    Req,
    UseGuards,
    HttpCode,
    HttpStatus,
    ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { PositionService } from './position.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { ListPositionQueryDto } from './dto/list-position-query.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { UserEntity } from 'src/users/entities/user.entity';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';

@Controller('positions')

export class PositionController {
    constructor(private readonly positionService: PositionService) { }

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
    // ➕ CRÉER
    // ============================================================
    @Post()
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.CREATED)
    create(
        @Body() dto: CreatePositionDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.positionService.create(dto, user, lang);
    }

    // ============================================================
    // 📋 LISTER
    // ============================================================
    @Get()
    @UseGuards(AuthentificationGuard)
    findAll(
        @Query() query: ListPositionQueryDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.positionService.findAll(query, user, lang);
    }

    // ============================================================
    // 🔍 VOIR UNE
    // ============================================================
    @Get(':id')
    findOne(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.positionService.findOne(id, lang);
    }

    // ============================================================
    // ✏️ MODIFIER
    // ============================================================
    @Patch(':id')
    @UseGuards(AuthentificationGuard)
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdatePositionDto,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.positionService.update(id, dto, user, lang);
    }

    // ============================================================
    // 🔄 TOGGLE STATUS
    // ============================================================
    @Patch(':id/toggle-status')
    @UseGuards(AuthentificationGuard)
    toggleStatus(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.positionService.toggleStatus(id, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER
    // ============================================================
    @Delete(':id')
    @UseGuards(AuthentificationGuard)
    remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: UserEntity,
        @Req() req: Request,
    ) {
        const lang = this.extractLanguage(req);
        return this.positionService.remove(id, user, lang);
    }
}