import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { PATTERNS } from '@favor/contracts';
import { SettingsService } from './settings.service';

@Controller()
export class SettingsController {
  constructor(private readonly service: SettingsService) { }

  @MessagePattern(PATTERNS.SETTINGS.GET)
  get() {
    return this.service.findOne();
  }

  @MessagePattern(PATTERNS.HEALTH)
  health() {
    return { service: 'settings', status: 'ok', at: new Date().toISOString() };
  }
}
