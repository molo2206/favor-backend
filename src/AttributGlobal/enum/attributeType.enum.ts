export enum AttributeType {
  TEXT = 'TEXT',
  COLOR = 'COLOR',
  IMAGE = 'IMAGE',
  SELECT = 'SELECT',
  NUMBER = 'NUMBER', // ✅ ex : Capacité (Go), Poids
  BOOLEAN = 'BOOLEAN', // ✅ ex : Bio, Sans gluten
}

/**
 * Types qui reposent sur une liste de valeurs (attribute_values).
 * Les autres (TEXT, NUMBER, BOOLEAN) acceptent une valeur libre.
 */
export const ATTRIBUTE_TYPES_WITH_VALUES: AttributeType[] = [
  AttributeType.COLOR,
  AttributeType.IMAGE,
  AttributeType.SELECT,
];
