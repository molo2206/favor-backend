export class TrackingNumberUtil {
  static generate(): string {
    const prefix = 'FAVORHELP-COLIS';
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');

    return `${prefix}-${timestamp}-${random}`;
  }
}
