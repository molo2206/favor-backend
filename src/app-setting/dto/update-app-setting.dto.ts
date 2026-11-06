import { PartialType } from '@nestjs/swagger';
import { CreateAppSettingDto } from './create-app-setting.dto';

export class UpdateAppSettingDto extends PartialType(CreateAppSettingDto) {}
