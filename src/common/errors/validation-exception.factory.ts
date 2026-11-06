// src/common/errors/validation-exception.factory.ts
import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

export const VALIDATION_ERROR_CODE = 'VALIDATION_ERROR';

export interface FieldValidationError {
  /** Chemin du champ (ex: "permissions.0.resourceId") */
  field: string;
  /** Nom de la contrainte class-validator (isNotEmpty, maxLength...) */
  constraint: string;
  /** Message par défaut de class-validator (anglais) */
  defaultMessage: string;
  /** Paramètres extraits du message (min, max, values) */
  params: Record<string, string>;
}

/** Extrait les paramètres utiles (min / max / valeurs autorisées) du message par défaut */
function extractParams(constraint: string, message: string): Record<string, string> {
  const params: Record<string, string> = {};
  const numbers = message.match(/-?\d+(\.\d+)?/g) ?? [];
  switch (constraint) {
    case 'min':
    case 'minLength':
    case 'arrayMinSize':
      if (numbers.length) params.min = numbers[numbers.length - 1];
      break;
    case 'max':
    case 'maxLength':
    case 'arrayMaxSize':
      if (numbers.length) params.max = numbers[numbers.length - 1];
      break;
    case 'isEnum':
    case 'isIn': {
      const idx = message.indexOf(':');
      if (idx !== -1) params.values = message.slice(idx + 1).trim();
      break;
    }
    default:
      break;
  }
  return params;
}

/** Aplatit les erreurs (y compris imbriquées : tableaux, objets) */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldValidationError[] {
  const out: FieldValidationError[] = [];
  for (const err of errors) {
    const field = parentPath ? `${parentPath}.${err.property}` : err.property;
    for (const [constraint, defaultMessage] of Object.entries(err.constraints ?? {})) {
      out.push({
        field,
        constraint,
        defaultMessage,
        params: extractParams(constraint, defaultMessage),
      });
    }
    if (err.children?.length) {
      out.push(...flattenValidationErrors(err.children, field));
    }
  }
  return out;
}

/**
 * exceptionFactory du ValidationPipe global :
 * les messages sont traduits ensuite par AllExceptionsFilter selon la langue de la requête.
 */
export function validationExceptionFactory(errors: ValidationError[]) {
  const details = flattenValidationErrors(errors);
  return new BadRequestException({
    statusCode: 400,
    code: VALIDATION_ERROR_CODE,
    message: details.map((d) => d.defaultMessage),
    errors: details,
  });
}
