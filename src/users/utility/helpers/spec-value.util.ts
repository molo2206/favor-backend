export function convertSpecValue(specType: string, value: any) {
  if (value === null || value === undefined) return null;

  switch (specType) {
    case 'BOOLEAN':
      return value === true || value === 'true' ;

    case 'NUMBER':
      return Number(value);

    case 'JSON':
      if (typeof value === 'object') return value;
      try {
        return JSON.parse(value);
      } catch {
        return value; 
      }

    case 'TEXT':
    default:
      return String(value);
  }
}
