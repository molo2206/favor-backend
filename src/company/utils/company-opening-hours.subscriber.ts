import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntitySubscriberInterface } from 'typeorm';
import { CompanyEntity } from '../entities/company.entity';
import { computeOpeningInfo } from './opening-hours.util';

/**
 * ✅ Calcule `isOpenNow` et `openingInfo` (statut comme Google) à chaque chargement d'une entreprise (find, query builder, relations).
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
      // ✅ Statut comme Google (texte en français ; GET /company/:id/opening-hours renvoie la langue demandée)
      const info = computeOpeningInfo(entity as any, process.env.COMPANY_HOURS_LANG || 'fr');
      entity.isOpenNow = info.isOpenNow;
      entity.openingInfo = {
        isOpenNow: info.isOpenNow,
        state: info.state,
        label: info.label,
        stateLabel: info.stateLabel,
        detail: info.detail,
        closesAt: info.closesAt,
        opensAt: info.opensAt,
        todayText: info.today.text,
        timezone: info.timezone,
      };
    } catch {
      entity.isOpenNow = null;
      entity.openingInfo = null;
    }
  }
}
