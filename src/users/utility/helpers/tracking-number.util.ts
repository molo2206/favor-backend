export class TrackingNumberUtil {
  static generate(): string {
    const random = Math.floor(100000 + Math.random() * 900000).toString();
    return `${random}`;
  }
}

export class TrackingNumberUtilLTa {
  static generate(): string {
    const random = Math.floor(100000 + Math.random() * 900000).toString();
    return `${random}`;
  }
}
