import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { BaggageRulesService } from './baggage-rules.service';
import { CreateBaggageRuleDto } from './dto/create-baggage-rule.dto';
import { UpdateBaggageRuleDto } from './dto/update-baggage-rule.dto';

@Controller('baggage-rules')
export class BaggageRulesController {
  constructor(private readonly baggageRulesService: BaggageRulesService) {}

  @Post()
  create(@Body() createBaggageRuleDto: CreateBaggageRuleDto) {
    return this.baggageRulesService.create(createBaggageRuleDto);
  }

  @Get()
  findAll() {
    return this.baggageRulesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.baggageRulesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBaggageRuleDto: UpdateBaggageRuleDto) {
    return this.baggageRulesService.update(+id, updateBaggageRuleDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.baggageRulesService.remove(+id);
  }
}
