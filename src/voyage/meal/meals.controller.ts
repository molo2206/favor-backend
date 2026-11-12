// src/voyage/meals/meals.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    ParseUUIDPipe,
    DefaultValuePipe,
    ParseIntPipe,
    UseGuards,
} from '@nestjs/common';
import { MealsService } from './meals.service';
import { CreateMealDto } from './dto/create-meal.dto';
import { UpdateMealDto } from './dto/update-meal.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';

@Controller('meals')
export class MealsController {
    constructor(private readonly mealsService: MealsService) { }

    @Post()
    @UseGuards(AuthentificationGuard)
    create(@Body() createMealDto: CreateMealDto, @CurrentUser() user: UserEntity) {
        return this.mealsService.create(createMealDto, user);
    }

    @Get()
    @UseGuards(AuthentificationGuard)
    findAll(
        @CurrentUser() user: UserEntity,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('isAvailable') isAvailable?: string,
    ) {
        const availableFlag = isAvailable === 'true' ? true : isAvailable === 'false' ? false : undefined;
        return this.mealsService.findAll(user, page, limit, availableFlag);
    }

    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
        return this.mealsService.findOne(id, user);
    }

    @Patch(':id')
    @UseGuards(AuthentificationGuard)
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateMealDto: UpdateMealDto,
        @CurrentUser() user: UserEntity,
    ) {
        return this.mealsService.update(id, updateMealDto, user);
    }

    @Delete(':id')
    @UseGuards(AuthentificationGuard)
    remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
        return this.mealsService.remove(id, user);
    }
}