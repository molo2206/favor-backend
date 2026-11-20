export class GeneratePin {
  static generate(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
