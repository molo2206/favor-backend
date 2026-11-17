import { Controller, Post, Body } from '@nestjs/common';
import { OpenaiService } from './openai.service';

@Controller('openai')
export class OpenaiController {
  constructor(private readonly openaiService: OpenaiService) {}

  @Post()
  async handlePrompt(@Body('prompt') prompt: string) {
    return await this.openaiService.ask(prompt);
  }
}