import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import {
  BOOLEAN_CAPABILITY_KEYS,
  CompanyCapabilities,
  defaultCapabilities,
  OfflineOp,
} from './company-capabilities';
import { TypeCompanyConfig } from './type-company-config.entity';

/**
 * Fournit les capacités effectives d'une entreprise selon son type.
 * Ordre : défaut du code (par type) < surcharge en base (type_company_config).
 * Résultat mis en cache 60 s pour éviter de lire la base à chaque opération.
 */
@Injectable()
export class CompanyCapabilitiesService {
  private readonly logger = new Logger(CompanyCapabilitiesService.name);
  private cache = new Map<string, { caps: CompanyCapabilities; at: number }>();
  private readonly ttlMs = 60 * 1000;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Capacités pour un TYPE d'entreprise */
  async forType(companyType?: string | null): Promise<CompanyCapabilities> {
    const key = String(companyType || '').toUpperCase();
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.caps;

    const caps = defaultCapabilities(key);
    try {
      const row = await this.dataSource.getRepository(TypeCompanyConfig).findOne({ where: { companyType: key } });
      if (row) this.applyOverride(caps, row);
    } catch (e: any) {
      // Table absente (SQL pas encore exécuté) → on garde les défauts du code
      if (!/doesn't exist|ER_NO_SUCH_TABLE|1146/i.test(String(e?.message))) {
        this.logger.warn(`Capacités : lecture type_company_config impossible (${e?.message})`);
      }
    }
    this.cache.set(key, { caps, at: Date.now() });
    return caps;
  }

  /** Capacités pour une ENTREPRISE (on lit son type) */
  async forCompany(companyId: string): Promise<CompanyCapabilities> {
    const company = await this.dataSource
      .getRepository(CompanyEntity)
      .findOne({ where: { id: companyId }, select: { id: true, typeCompany: true } as any });
    return this.forType(company?.typeCompany as any);
  }

  /** Une opération est-elle permise hors-ligne pour ce type ? */
  async isOfflineAllowed(companyType: string | null | undefined, op: OfflineOp): Promise<boolean> {
    const caps = await this.forType(companyType);
    return caps.offlineEnabled && caps.offlineAllowedOps.includes(op);
  }

  /** Vide le cache (après une mise à jour de configuration) */
  invalidate(companyType?: string) {
    if (companyType) this.cache.delete(String(companyType).toUpperCase());
    else this.cache.clear();
  }

  private applyOverride(caps: CompanyCapabilities, row: TypeCompanyConfig) {
    for (const k of BOOLEAN_CAPABILITY_KEYS) {
      const v = (row as any)[k];
      if (v !== null && v !== undefined) (caps as any)[k] = !!Number(v) || v === true;
    }
    if (Array.isArray(row.offlineAllowedOps)) {
      caps.offlineAllowedOps = row.offlineAllowedOps
        .map((o) => String(o).toUpperCase())
        .filter((o): o is OfflineOp => (Object.values(OfflineOp) as string[]).includes(o)) as OfflineOp[];
    }
  }
}
