// src/common/interceptors/safe-class-serializer.interceptor.ts
import {
  ClassSerializerContextOptions,
  ClassSerializerInterceptor,
  Injectable,
  PlainLiteralObject,
  StreamableFile,
} from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import { Stream } from 'stream';

/**
 * ClassSerializerInterceptor sécurisé.
 *
 * Le ClassSerializerInterceptor de Nest parcourt TOUT objet retourné par un contrôleur.
 * Quand une route fait `return res.send(...)` / `return res.end(...)` avec @Res(),
 * il parcourt l'objet HTTP natif (socket, listeners...) et appelle ses fonctions avec
 * un mauvais contexte → "this.removeListener is not a function" puis crash de Node
 * (ERR_INTERNAL_ASSERTION).
 *
 * Cette version ne sérialise que les données "classiques" et laisse passer tel quel :
 * réponses HTTP, sockets, flux, Buffers, StreamableFile.
 */
@Injectable()
export class SafeClassSerializerInterceptor extends ClassSerializerInterceptor {
  serialize(
    response: PlainLiteralObject | Array<PlainLiteralObject>,
    options: ClassSerializerContextOptions,
  ): PlainLiteralObject | Array<PlainLiteralObject> {
    if (!SafeClassSerializerInterceptor.isSerializable(response)) {
      return response;
    }
    return super.serialize(response, options);
  }

  static isSerializable(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value !== 'object') return true;
    if (
      value instanceof ServerResponse ||
      value instanceof IncomingMessage ||
      value instanceof Socket ||
      value instanceof Stream ||
      value instanceof StreamableFile ||
      Buffer.isBuffer(value) ||
      ArrayBuffer.isView(value) ||
      value instanceof ArrayBuffer
    ) {
      return false;
    }
    const v = value as Record<string, any>;
    // Objets "réponse HTTP" provenant d'autres librairies (express, http-proxy...)
    if (typeof v.setHeader === 'function' && typeof v.end === 'function') return false;
    if (typeof v.pipe === 'function' && typeof v.on === 'function') return false;
    return true;
  }
}
