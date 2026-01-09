import { BadRequestException } from '@nestjs/common';
import { Product } from 'src/products/entities/product.entity';

export class PriceCalculator {
  static calculateTotalPrice(
    product: Product,
    startDate: string,
    endDate: string,
    roomsBooked: number,
    quantity?: number,
  ): number {
    // Calculer le nombre de nuits
    const start = new Date(startDate);
    const end = new Date(endDate);
    const nights = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    if (nights <= 0) {
      throw new BadRequestException('La date de fin doit être après la date de début');
    }

    // Déterminer le prix à utiliser (priorité des différents prix)
    const pricePerNight = this.getPricePerNight(product);

    // Calcul du prix total
    const totalPrice = pricePerNight * nights * roomsBooked * (quantity || 1);

    // Arrondir à 2 décimales
    return Math.round(totalPrice * 100) / 100;
  }

  private static getPricePerNight(product: Product): number {
    // Logique de priorité des prix
    if (product.dailyRate && product.dailyRate > 0) {
      return product.dailyRate; // Pour location de voitures
    } else if (product.detail && product.detail > 0) {
      return product.detail; // Prix détail
    } else if (product.gros && product.gros > 0) {
      return product.gros; // Prix gros
    } else if (product.price && product.price > 0) {
      return product.price; // Prix de base
    } else if (product.salePrice && product.salePrice > 0) {
      return product.salePrice; // Prix de vente
    } else {
      throw new BadRequestException('Aucun prix défini pour ce produit');
    }
  }

  // Méthode utilitaire pour calculer le nombre de nuits
  static calculateNights(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const nights = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    if (nights <= 0) {
      throw new BadRequestException('La date de fin doit être après la date de début');
    }
    
    return nights;
  }

  // Méthode pour obtenir le détail du calcul
  static getPriceBreakdown(
    product: Product,
    startDate: string,
    endDate: string,
    roomsBooked: number,
    quantity?: number,
  ) {
    const nights = this.calculateNights(startDate, endDate);
    const pricePerNight = this.getPricePerNight(product);
    const totalPrice = this.calculateTotalPrice(product, startDate, endDate, roomsBooked, quantity);

    return {
      pricePerNight,
      nights,
      roomsBooked,
      quantity: quantity || 1,
      totalPrice,
      priceSource: this.getPriceSource(product),
      calculation: `${pricePerNight} × ${nights} nuits × ${roomsBooked} chambres × ${quantity || 1} = ${totalPrice}`
    };
  }

  private static getPriceSource(product: Product): string {
    if (product.dailyRate && product.dailyRate > 0) return 'dailyRate';
    if (product.detail && product.detail > 0) return 'detail';
    if (product.gros && product.gros > 0) return 'gros';
    if (product.price && product.price > 0) return 'price';
    if (product.salePrice && product.salePrice > 0) return 'salePrice';
    return 'unknown';
  }
}