import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntitySubscriberInterface } from 'typeorm';
import { CompanyEntity } from '../entities/company.entity';
import { isOpenNow } from './opening-hours.util';

/**
 * ✅ Calcule `isOpenNow` à chaque chargement d'une entreprise (find, query builder, relations).
 * Remplace l'ancien @AfterLoad dans l'entité : une méthode dans CompanyEntity
 * cassait les types Omit<CompanyEntity, …> utilisés dans company.service (erreur TS2322 au build).
 */
@Injectable()
export class CompanyOpeningHoursSubscriber implements EntitySubscriberInterface<CompanyEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return CompanyEntity;
  }

  afterLoad(entity: CompanyEntity): void {
    try {
      entity.isOpenNow = isOpenNow(entity);
    } catch {
      entity.isOpenNow = null;
    }
  }
}
