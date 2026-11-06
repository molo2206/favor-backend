
export class CreateNetworkDto {
  name: string;
  currency: string; // ex: "USD,CDF"
  pourcentage: number;
  image?: string;
  countryId: string;
}