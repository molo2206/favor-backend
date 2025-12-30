// create-colis.dto.ts
export class CreateColisDto {
  description: string;
  weight: number;
  value?: number;
  receiverId?: string; 
  pickupAddress: any;
  dropAddress: any;
  photos?: string;
}
