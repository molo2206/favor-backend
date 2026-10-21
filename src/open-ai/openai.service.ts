import { Injectable, InternalServerErrorException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class OpenaiService {
  private readonly openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY manquante dans les variables d’environnement');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  async ask(prompt: string): Promise<{ prompt: string; response: string }> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      });

      const response = completion.choices[0]?.message?.content?.trim() || '';

      return { prompt, response };
    } catch (error: any) {
      console.error('❌ Erreur OpenAI:', error);

      // Gestion d'erreurs précises
      if (error.status === 401) {
        throw new UnauthorizedException('Clé API OpenAI invalide ou expirée');
      }

      if (error.status === 400) {
        throw new BadRequestException('Requête OpenAI invalide');
      }

      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new InternalServerErrorException('Impossible de se connecter à OpenAI');
      }

      throw new InternalServerErrorException('Erreur interne lors de la communication avec OpenAI');
    }
  }
}
