// src/common/errors/all-exceptions.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { STATUS_CODES } from 'http';
import { randomUUID } from 'crypto';
import {
  EntityNotFoundError,
  EntityPropertyNotFoundError,
  QueryFailedError,
  TypeORMError,
} from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { ERROR_MESSAGES_CATALOG, SupportedLang } from './error-messages.catalog';
import { FieldValidationError, VALIDATION_ERROR_CODE } from './validation-exception.factory';

const SUPPORTED_LANGS: SupportedLang[] = ['fr', 'en', 'es', 'sw', 'ar'];

interface NormalizedError {
  status: number;
  code: string;
  message: string | string[];
  /** Champs supplémentaires renvoyés par le code métier (data, errors, ...) */
  extra?: Record<string, any>;
  /** Détails techniques (exposés uniquement hors production) */
  debug?: Record<string, any>;
}

/** Messages anglais générés par Nest / multer / body-parser → clé i18n */
const FRAMEWORK_MESSAGES: Array<{ test: RegExp; key: string; params?: (m: RegExpMatchArray) => Record<string, string> }> = [
  { test: /^Cannot (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD) (.+)$/i, key: 'errors.route_not_found', params: (m) => ({ method: m[1].toUpperCase(), path: m[2] }) },
  { test: /^File too large$/i, key: 'errors.file.too_large_generic' },
  { test: /^Too many (files|parts|fields)$/i, key: 'errors.file.too_many' },
  { test: /^Unexpected field(?: - (.+))?$/i, key: 'errors.file.unexpected_field', params: (m) => ({ field: m[1] ?? '' }) },
  { test: /^Unexpected end of form$/i, key: 'errors.file.upload_failed' },
  { test: /^Multipart: Boundary not found$/i, key: 'errors.file.upload_failed' },
  { test: /^Forbidden resource$/i, key: 'errors.forbidden' },
  { test: /^Unauthorized$/i, key: 'errors.unauthorized' },
  { test: /^Internal server error$/i, key: 'errors.internal' },
  { test: /^Validation failed \(.+\)$/i, key: 'errors.validation_failed' },
  { test: /^request entity too large$/i, key: 'errors.payload_too_large' },
];

/**
 * Filtre global : toutes les erreurs (HTTP, TypeORM/MySQL, multer, JWT, Axios,
 * erreurs inconnues) sont converties en une réponse JSON homogène et traduite :
 *
 * {
 *   statusCode, error, code, message, errors?, path, method, timestamp, requestId
 * }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsHandler');
  private readonly isProd = process.env.NODE_ENV === 'production';

  constructor(private readonly i18n: I18nService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const type = host.getType<'http' | 'ws' | 'rpc'>();

    if (type === 'ws') {
      this.handleWs(exception, host);
      return;
    }
    if (type !== 'http') {
      this.logger.error(this.describe(exception), (exception as any)?.stack);
      return;
    }

    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const lang = this.resolveLang(req);
    const requestId = (req?.headers?.['x-request-id'] as string) || randomUUID();

    let normalized: NormalizedError;
    try {
      normalized = this.normalize(exception, lang);
    } catch (e) {
      normalized = {
        status: 500,
        code: 'INTERNAL_ERROR',
        message: this.t('errors.internal', lang),
      };
    }

    // Journalisation
    const where = `${req?.method} ${req?.originalUrl ?? req?.url}`;
    if (normalized.status >= 500) {
      this.logger.error(
        `[${requestId}] ${where} → ${normalized.status} ${normalized.code} : ${this.describe(exception)}`,
        (exception as any)?.stack,
      );
    } else {
      this.logger.warn(
        `[${requestId}] ${where} → ${normalized.status} ${normalized.code} : ${
          Array.isArray(normalized.message) ? normalized.message.join(' | ') : normalized.message
        }`,
      );
    }

    // Réponse déjà (partiellement) envoyée : on ne peut plus rien écrire
    if (!res || res.headersSent || res.writableEnded) {
      try {
        if (res && !res.writableEnded) res.end();
      } catch {
        /* ignore */
      }
      return;
    }

    const body: Record<string, any> = {
      ...(normalized.extra ?? {}),
      statusCode: normalized.status,
      error: STATUS_CODES[normalized.status] ?? 'Error',
      code: normalized.code,
      message: normalized.message,
      path: req?.originalUrl ?? req?.url,
      method: req?.method,
      timestamp: new Date().toISOString(),
      requestId,
    };
    if (!this.isProd && normalized.debug) body.debug = normalized.debug;

    try {
      res.setHeader('x-request-id', requestId);
      res.status(normalized.status).json(body);
    } catch (e: any) {
      this.logger.error(`Impossible d'envoyer la réponse d'erreur : ${e?.message}`);
    }
  }

  // ==========================================================================
  // Normalisation
  // ==========================================================================
  private normalize(exception: unknown, lang: SupportedLang): NormalizedError {
    // ---------------- HttpException (Nest) ----------------
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception, lang);
    }

    const err = exception as any;

    // ---------------- TypeORM ----------------
    if (exception instanceof EntityNotFoundError) {
      return { status: 404, code: 'ENTITY_NOT_FOUND', message: this.t('errors.db.entity_not_found', lang) };
    }
    if (exception instanceof EntityPropertyNotFoundError) {
      return {
        status: 400,
        code: 'INVALID_PROPERTY',
        message: this.t('errors.bad_request', lang),
        debug: { detail: err?.message },
      };
    }
    if (exception instanceof QueryFailedError) {
      return this.fromQueryFailed(exception, lang);
    }

    // ---------------- Erreurs de connexion BDD ----------------
    if (['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR', 'ETIMEDOUT', 'ER_ACCESS_DENIED_ERROR'].includes(err?.code) && !err?.isAxiosError) {
      return {
        status: 503,
        code: 'DATABASE_UNAVAILABLE',
        message: this.t('errors.db.connection', lang),
        debug: { detail: err?.message },
      };
    }

    if (exception instanceof TypeORMError) {
      return {
        status: 500,
        code: 'DATABASE_ERROR',
        message: this.t('errors.db.query_failed', lang),
        debug: { detail: err?.message },
      };
    }

    // ---------------- Multer (upload) ----------------
    if (err?.name === 'MulterError') {
      switch (err.code) {
        case 'LIMIT_FILE_SIZE':
          return { status: 413, code: 'FILE_TOO_LARGE', message: this.t('errors.file.too_large_generic', lang) };
        case 'LIMIT_FILE_COUNT':
        case 'LIMIT_PART_COUNT':
        case 'LIMIT_FIELD_COUNT':
          return { status: 400, code: 'TOO_MANY_FILES', message: this.t('errors.file.too_many', lang) };
        case 'LIMIT_UNEXPECTED_FILE':
          return {
            status: 400,
            code: 'UNEXPECTED_FILE_FIELD',
            message: this.t('errors.file.unexpected_field', lang, { field: err.field ?? '' }),
          };
        default:
          return { status: 400, code: 'UPLOAD_FAILED', message: this.t('errors.file.upload_failed', lang) };
      }
    }

    // ---------------- JWT ----------------
    if (err?.name === 'TokenExpiredError') {
      return { status: 401, code: 'TOKEN_EXPIRED', message: this.t('errors.auth.token_expired', lang) };
    }
    if (err?.name === 'JsonWebTokenError' || err?.name === 'NotBeforeError') {
      return { status: 401, code: 'TOKEN_INVALID', message: this.t('errors.auth.token_invalid', lang) };
    }

    // ---------------- body-parser ----------------
    if (err?.type === 'entity.parse.failed') {
      return { status: 400, code: 'INVALID_JSON', message: this.t('errors.json.invalid_body', lang) };
    }
    if (err?.type === 'entity.too.large') {
      return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: this.t('errors.payload_too_large', lang) };
    }

    // ---------------- Axios (services externes) ----------------
    if (err?.isAxiosError) {
      let service = 'API';
      try {
        service = new URL(err?.config?.url, err?.config?.baseURL).hostname || service;
      } catch {
        /* ignore */
      }
      const timeout = err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT';
      return {
        status: timeout ? 504 : 502,
        code: timeout ? 'EXTERNAL_TIMEOUT' : 'EXTERNAL_SERVICE_ERROR',
        message: this.t(timeout ? 'errors.external_timeout' : 'errors.external_service', lang, { service }),
        debug: { detail: err?.message, status: err?.response?.status, data: err?.response?.data },
      };
    }

    // ---------------- Timeout (puppeteer, rxjs...) ----------------
    if (err?.name === 'TimeoutError') {
      return { status: 504, code: 'TIMEOUT', message: this.t('errors.timeout', lang) };
    }

    // ---------------- Erreur avec un statut HTTP (http-errors...) ----------------
    const rawStatus = Number(err?.status ?? err?.statusCode);
    if (rawStatus >= 400 && rawStatus < 600) {
      return {
        status: rawStatus,
        code: this.codeFromStatus(rawStatus),
        message:
          rawStatus >= 500
            ? this.t('errors.internal', lang)
            : this.translateMessage(err?.message, lang) ?? this.t('errors.bad_request', lang),
        debug: { detail: err?.message },
      };
    }

    // ---------------- Inconnue ----------------
    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: this.t('errors.internal', lang),
      debug: { name: err?.name, detail: err?.message },
    };
  }

  private fromHttpException(exception: HttpException, lang: SupportedLang): NormalizedError {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const code = this.codeFromStatus(status);

    // Réponse sous forme de chaîne
    if (typeof response === 'string') {
      return {
        status,
        code,
        message: this.translateMessage(response, lang) ?? this.defaultMessage(status, lang),
      };
    }

    const obj = { ...(response as Record<string, any>) };

    // Erreurs de validation (ValidationPipe global)
    if (obj.code === VALIDATION_ERROR_CODE && Array.isArray(obj.errors)) {
      const details = obj.errors as FieldValidationError[];
      const messages = details.map((d) => this.translateConstraint(d, lang));
      return {
        status,
        code: VALIDATION_ERROR_CODE,
        message: messages.length ? messages : this.t('errors.validation_failed', lang),
        extra: {
          errors: details.map((d, i) => ({
            field: d.field,
            constraint: d.constraint,
            message: messages[i],
          })),
        },
      };
    }

    // Erreurs de validation au format Nest standard (pipes locaux)
    let message: string | string[];
    if (Array.isArray(obj.message)) {
      message = obj.message.map((m: any) =>
        typeof m === 'string' ? this.translateMessage(m, lang) ?? m : m,
      );
    } else if (typeof obj.message === 'string') {
      message = this.translateMessage(obj.message, lang) ?? obj.message;
    } else {
      message = this.defaultMessage(status, lang);
    }

    const { statusCode, error, message: _m, code: customCode, ...extra } = obj;
    return {
      status,
      code: typeof customCode === 'string' && customCode ? customCode : code,
      message,
      extra,
    };
  }

  /** Erreurs MySQL (QueryFailedError) */
  private fromQueryFailed(exception: QueryFailedError, lang: SupportedLang): NormalizedError {
    const driver = (exception as any).driverError ?? {};
    const code: string = driver.code ?? (exception as any).code ?? '';
    const sqlMessage: string = driver.sqlMessage ?? exception.message ?? '';
    const debug = { code, sqlMessage, sql: (exception as any).query };

    const column =
      sqlMessage.match(/column '([^']+)'/i)?.[1] ??
      sqlMessage.match(/Field '([^']+)'/i)?.[1] ??
      sqlMessage.match(/FOREIGN KEY \(`([^`]+)`\)/i)?.[1] ??
      '';

    switch (code) {
      case 'ER_DUP_ENTRY': {
        const key = sqlMessage.match(/for key '([^']+)'/i)?.[1] ?? '';
        const field = key.split('.').pop()?.replace(/^(IDX_|UQ_|uq_|idx_|REL_)/, '') ?? '';
        const value = sqlMessage.match(/Duplicate entry '([^']*)'/i)?.[1];
        return {
          status: 409,
          code: 'DUPLICATE_ENTRY',
          message: field
            ? this.t('errors.db.duplicate_entry', lang, { field: value ? `${field} : ${value}` : field })
            : this.t('errors.db.duplicate_entry_generic', lang),
          debug,
        };
      }
      case 'ER_NO_REFERENCED_ROW':
      case 'ER_NO_REFERENCED_ROW_2':
        return {
          status: 400,
          code: 'INVALID_REFERENCE',
          message: this.t('errors.db.foreign_key_invalid', lang, { field: column }),
          debug,
        };
      case 'ER_ROW_IS_REFERENCED':
      case 'ER_ROW_IS_REFERENCED_2':
        return { status: 409, code: 'RESOURCE_IN_USE', message: this.t('errors.db.foreign_key_in_use', lang), debug };
      case 'ER_BAD_NULL_ERROR':
      case 'ER_NO_DEFAULT_FOR_FIELD':
        return {
          status: 400,
          code: 'REQUIRED_FIELD',
          message: this.t('errors.db.required_field', lang, { field: column }),
          debug,
        };
      case 'ER_DATA_TOO_LONG':
        return {
          status: 400,
          code: 'VALUE_TOO_LONG',
          message: this.t('errors.db.value_too_long', lang, { field: column }),
          debug,
        };
      case 'WARN_DATA_TRUNCATED':
      case 'ER_TRUNCATED_WRONG_VALUE':
      case 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD':
      case 'ER_WARN_DATA_OUT_OF_RANGE':
      case 'ER_INVALID_JSON_TEXT':
      case 'ER_WRONG_VALUE_FOR_TYPE':
        return {
          status: 400,
          code: 'INVALID_VALUE',
          message: this.t('errors.db.invalid_value', lang, { field: column }),
          debug,
        };
      case 'ER_LOCK_DEADLOCK':
      case 'ER_LOCK_WAIT_TIMEOUT':
        return { status: 503, code: 'DATABASE_BUSY', message: this.t('errors.db.deadlock', lang), debug };
      default:
        return { status: 500, code: 'DATABASE_ERROR', message: this.t('errors.db.query_failed', lang), debug };
    }
  }

  // ==========================================================================
  // WebSocket
  // ==========================================================================
  private handleWs(exception: unknown, host: ArgumentsHost) {
    try {
      const client = host.switchToWs().getClient();
      const lang = this.normalizeLang(
        client?.handshake?.headers?.['accept-language'] ?? client?.handshake?.auth?.lang,
      );
      const n = this.normalize(exception, lang);
      if (n.status >= 500) this.logger.error(`WS : ${this.describe(exception)}`, (exception as any)?.stack);
      client?.emit?.('exception', { status: 'error', statusCode: n.status, code: n.code, message: n.message });
    } catch (e: any) {
      this.logger.error(`WS exception non gérée : ${e?.message}`);
    }
  }

  // ==========================================================================
  // Traduction
  // ==========================================================================
  private resolveLang(req: Request): SupportedLang {
    const candidates = [
      req?.query?.lang as string,
      req?.headers?.['x-lang'] as string,
      req?.headers?.['accept-language'] as string,
      (req as any)?.currentUser?.preferredLanguage,
    ];
    for (const c of candidates) {
      const lang = this.normalizeLang(c, null);
      if (lang) return lang;
    }
    return 'fr';
  }

  private normalizeLang(value: unknown, fallback: SupportedLang | null = 'fr'): SupportedLang {
    if (typeof value === 'string' && value.trim()) {
      const primary = value.split(',')[0].split(';')[0].trim().toLowerCase().slice(0, 2) as SupportedLang;
      if (SUPPORTED_LANGS.includes(primary)) return primary;
    }
    return fallback as SupportedLang;
  }

  private t(key: string, lang: SupportedLang, params?: Record<string, any>): string {
    try {
      return this.i18n.translate(key, lang, params);
    } catch {
      return key;
    }
  }

  /**
   * Traduit un message :
   *  1. message écrit en dur connu (catalogue)
   *  2. clé i18n (ex: "company_not_found")
   *  3. message technique du framework (Cannot GET..., File too large...)
   * Retourne null si aucune traduction n'est trouvée.
   */
  private translateMessage(message: unknown, lang: SupportedLang): string | null {
    if (typeof message !== 'string' || !message) return null;

    const catalog = ERROR_MESSAGES_CATALOG[message];
    if (catalog) return catalog[lang] ?? catalog.fr;

    if (/^[\w.-]+$/.test(message) && (message.includes('.') || message.includes('_'))) {
      const translated = this.t(message, lang);
      if (translated && translated !== message) return translated;
    }

    for (const fm of FRAMEWORK_MESSAGES) {
      const m = message.match(fm.test);
      if (m) return this.t(fm.key, lang, fm.params?.(m));
    }
    return null;
  }

  private translateConstraint(d: FieldValidationError, lang: SupportedLang): string {
    const key = `validation.${d.constraint}`;
    const translated = this.t(key, lang, { field: d.field, ...d.params });
    if (translated !== key) return translated;
    // Contrainte personnalisée (message défini dans le DTO)
    return this.translateMessage(d.defaultMessage, lang) ?? d.defaultMessage;
  }

  private defaultMessage(status: number, lang: SupportedLang): string {
    const map: Record<number, string> = {
      400: 'errors.bad_request',
      401: 'errors.unauthorized',
      403: 'errors.forbidden',
      404: 'errors.not_found',
      405: 'errors.method_not_allowed',
      409: 'errors.conflict',
      413: 'errors.payload_too_large',
      415: 'errors.unsupported_media_type',
      429: 'errors.too_many_requests',
      503: 'errors.service_unavailable',
      504: 'errors.timeout',
    };
    return this.t(map[status] ?? (status >= 500 ? 'errors.internal' : 'errors.bad_request'), lang);
  }

  private codeFromStatus(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      402: 'PAYMENT_REQUIRED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      405: 'METHOD_NOT_ALLOWED',
      408: 'REQUEST_TIMEOUT',
      409: 'CONFLICT',
      410: 'GONE',
      413: 'PAYLOAD_TOO_LARGE',
      415: 'UNSUPPORTED_MEDIA_TYPE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_ERROR',
      501: 'NOT_IMPLEMENTED',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT',
    };
    return map[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
  }

  private describe(exception: unknown): string {
    const err = exception as any;
    if (!err) return 'Erreur inconnue';
    const driver = err.driverError ? ` (${err.driverError.code} ${err.driverError.sqlMessage ?? ''})` : '';
    return `${err.name ?? 'Error'}: ${err.message ?? String(err)}${driver}`;
  }
}

