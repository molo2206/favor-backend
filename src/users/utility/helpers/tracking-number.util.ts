export class TrackingNumberUtil {
  static generate(): string {
    const prefix = 'FH-LOG';
    const random = Math.floor(Math.random() * 1_000_000) 
      .toString()
      .padStart(6, '0'); 

    return `${prefix}-${random}`;
  }
}
