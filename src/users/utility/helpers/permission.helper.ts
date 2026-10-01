/* eslint-disable no-extra-boolean-cast */
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';
import { Resource } from 'src/ressource/entity/resource.entity';
import { CompanyType } from 'src/company/enum/type.company.enum';

@Injectable()
export class PermissionHelper {
  private resourceCache: Map<string, string> = new Map();

  constructor(@InjectDataSource() private dataSource: DataSource) {}

  private async getResourceId(name: string): Promise<string | null> {
    if (this.resourceCache.has(name)) return this.resourceCache.get(name)!;
    const resourceRepo = this.dataSource.getRepository(Resource);
    const resource = await resourceRepo.findOne({ where: { name } });
    if (resource) {
      this.resourceCache.set(name, resource.id);
      return resource.id;
    }
    return null;
  }

  /**
   * Détermine la ressource appropriée selon le type d'entreprise
   * Basé sur la table resources :
   * - PRODUITS_RESTAURANT pour RESTAURANT
   * - PRODUITS_MARKET pour SHOP, GROCERY
   * - PRODUCTS_RENTAL pour les locations
   * - CARS pour CAR, TAXI
   * - SERVICES pour SERVICE
   * - SHIPMENTS pour SHIPPING, LOGISTIC_AGENCY, TRANSPORT_AGENCY
   * - PRODUCTS par défaut
   */
  getResourceByCompanyType(companyType: CompanyType): string {
    switch (companyType) {
      case CompanyType.RESTAURANT:
        return 'PRODUITS_RESTAURANT';

      case CompanyType.SHOP:
      case CompanyType.GROCERY:
        return 'PRODUITS_MARKET';

      case CompanyType.CAR:
      case CompanyType.TAXI:
        return 'CARS';

      case CompanyType.SERVICE:
        return 'SERVICES';

      case CompanyType.SHIPPING:
      case CompanyType.LOGISTIC_AGENCY:
      case CompanyType.TRANSPORT_AGENCY:
        return 'SHIPMENTS';

      case CompanyType.HOTEL:
      case CompanyType.AGENCE:
        return 'PRODUCTS_RENTAL';

      default:
        return 'PRODUCTS';
    }
  }

  /**
   * Détermine la ressource pour les commandes selon le type d'entreprise
   */
  getOrderResourceByCompanyType(companyType: CompanyType): string {
    switch (companyType) {
      case CompanyType.RESTAURANT:
        return 'ORDERS_RESTAURANT'; // ✅ Existe

      case CompanyType.SHOP:
        return 'ORDERS_SHOP'; // ✅ Existe

      case CompanyType.CAR:
      case CompanyType.TAXI:
        return 'ORDERS_CAR'; // ✅ Existe

      case CompanyType.GROCERY:
        return 'ORDERS_MARKET'; // ✅ Existe (Commandes marché)

      // Pour les autres types, pas de ressource spécifique
      // On utilise ORDERS_MARKET comme fallback ou on retourne une chaîne vide
      case CompanyType.SERVICE:
      case CompanyType.HOTEL:
      case CompanyType.AGENCE:
      case CompanyType.SHIPPING:
      case CompanyType.LOGISTIC_AGENCY:
      case CompanyType.TRANSPORT_AGENCY:
      default:
        // Pas de ressource spécifique dans la base, on retourne ORDERS_MARKET par défaut
        // ou null pour indiquer l'absence de permission
        return 'ORDERS_MARKET';
    }
  }

  /**
   * Vérifie si l'utilisateur a la permission pour voir les commandes
   * selon le type d'entreprise
   */
  async hasOrderReadPermission(
    user: UserEntity,
    companyType: CompanyType,
  ): Promise<boolean> {
    const requiredResource = this.getOrderResourceByCompanyType(companyType);
    return this.hasPermissionOnResource(user, requiredResource, 'canRead');
  }

  /**
   * Vérifie si l'utilisateur a la permission canManage pour gérer les commandes
   * pour une autre entreprise selon son type
   */
  async hasOrderManagePermissionForCompanyType(
    user: UserEntity,
    companyType: CompanyType,
  ): Promise<boolean> {
    const requiredResource = this.getOrderResourceByCompanyType(companyType);
    return this.hasManageOnResource(user, requiredResource);
  }

  /**
   * Vérifie si l'utilisateur a la permission pour créer des commandes
   * selon le type d'entreprise
   */
  async hasOrderCreatePermission(
    user: UserEntity,
    companyType: CompanyType,
  ): Promise<boolean> {
    const requiredResource = this.getOrderResourceByCompanyType(companyType);
    return this.hasPermissionOnResource(user, requiredResource, 'canCreate');
  }

  /**
   * Vérifie si l'utilisateur a la permission pour mettre à jour des commandes
   * selon le type d'entreprise
   */
  async hasOrderUpdatePermission(
    user: UserEntity,
    companyType: CompanyType,
  ): Promise<boolean> {
    const requiredResource = this.getOrderResourceByCompanyType(companyType);
    return this.hasPermissionOnResource(user, requiredResource, 'canUpdate');
  }

  /**
   * Vérifie si l'utilisateur a la permission pour supprimer des commandes
   * selon le type d'entreprise
   */
  async hasOrderDeletePermission(
    user: UserEntity,
    companyType: CompanyType,
  ): Promise<boolean> {
    const requiredResource = this.getOrderResourceByCompanyType(companyType);
    return this.hasPermissionOnResource(user, requiredResource, 'canDelete');
  }

  /**
   * Récupère les utilisateurs d'une compagnie qui ont la permission canRead
   * sur les commandes selon le type d'entreprise
   */
  async getUsersWithOrderReadPermission(
    companyId: string,
    branchId: string,
    companyType: CompanyType,
  ): Promise<string[]> {
    const requiredResource = this.getOrderResourceByCompanyType(companyType);
    return this.getUsersWithPermissionOnResource(
      companyId,
      branchId,
      requiredResource,
      'canRead',
    );
  }

  /**
   * Récupère les utilisateurs d'une compagnie qui ont la permission canCreate
   * sur les commandes selon le type d'entreprise
   */
  async getUsersWithOrderCreatePermission(
    companyId: string,
    branchId: string,
    companyType: CompanyType,
  ): Promise<string[]> {
    const requiredResource = this.getOrderResourceByCompanyType(companyType);
    return this.getUsersWithPermissionOnResource(
      companyId,
      branchId,
      requiredResource,
      'canCreate',
    );
  }

  /**
   * Vérifie si l'utilisateur a la permission canManage sur une ressource spécifique
   */
  async hasManageOnResource(
    user: UserEntity,
    resourceName: string,
  ): Promise<boolean> {
    console.log('START hasManageOnResource');

    if (!user.activeCompanyId) {
      console.log('PAS de activeCompanyId');
      return false;
    }
    console.log('activeCompanyId:', user.activeCompanyId);

    const resourceId = await this.getResourceId(resourceName);
    if (!resourceId) {
      console.log('Ressource non trouvée:', resourceName);
      return false;
    }
    console.log('resourceId:', resourceId);

    const userCompanyRepo = this.dataSource.getRepository(UserHasCompanyEntity);
    const userCompany = await userCompanyRepo.findOne({
      where: {
        user: { id: user.id },
        company: { id: user.activeCompanyId },
      },
    });
    if (!userCompany) {
      console.log('user_has_company non trouvé');
      return false;
    }
    console.log('userCompany.id:', userCompany.id);

    const permissionRepo = this.dataSource.getRepository(
      CompanyHasUserResource,
    );
    const permission = await permissionRepo.findOne({
      where: {
        userCompanyId: userCompany.id,
        resourceId: resourceId,
      },
    });

    console.log(
      '🔑 permission trouvée?',
      permission?.id,
      'canManage=',
      permission?.canManage,
    );

    if (!permission) {
      console.log('❌ Aucune permission trouvée');
      return false;
    }

    // ✅ Correction : utiliser !! pour convertir en boolean (1 ou true → true, 0 ou false → false)
    const result = !!permission.canManage;
    console.log('🏁 RETURN:', result);
    return result;
  }

  /**
   * Vérifie si l'utilisateur a une permission spécifique (canCreate, canRead, canUpdate, canDelete)
   * sur une ressource donnée
   */
  async hasPermissionOnResource(
    user: UserEntity,
    resourceName: string,
    action: 'canCreate' | 'canRead' | 'canUpdate' | 'canDelete',
  ): Promise<boolean> {
    console.log(
      '🔍 [hasPermissionOnResource] user.id=',
      user.id,
      'resourceName=',
      resourceName,
      'action=',
      action,
    );
    if (!user.activeCompanyId) return false;

    const resourceId = await this.getResourceId(resourceName);
    if (!resourceId) return false;

    const userCompanyRepo = this.dataSource.getRepository(UserHasCompanyEntity);
    const userCompany = await userCompanyRepo.findOne({
      where: {
        user: { id: user.id },
        company: { id: user.activeCompanyId },
      },
    });
    if (!userCompany) return false;

    const permissionRepo = this.dataSource.getRepository(
      CompanyHasUserResource,
    );
    const permission = await permissionRepo.findOne({
      where: {
        userCompanyId: userCompany.id,
        resourceId: resourceId,
      },
    });

    if (!permission) return false;

    // ✅ Correction : utiliser !! pour convertir en boolean
    if (!!permission.canManage) return true;

    switch (action) {
      case 'canCreate':
        return !!permission.canCreate;
      case 'canRead':
        return !!permission.canRead;
      case 'canUpdate':
        return !!permission.canUpdate;
      case 'canDelete':
        return !!permission.canDelete;
      default:
        return false;
    }
  }

  /**
   * Vérifie si l'utilisateur a la permission pour créer des produits
   * selon le type d'entreprise
   */
  async hasProductCreatePermission(
    user: UserEntity,
    companyType: CompanyType,
  ): Promise<boolean> {
    const requiredResource = this.getResourceByCompanyType(companyType);
    return this.hasPermissionOnResource(user, requiredResource, 'canCreate');
  }

  /**
   * Vérifie si l'utilisateur a la permission canManage pour créer des produits
   * pour une autre entreprise selon son type
   */
  async hasProductManagePermissionForCompanyType(
    user: UserEntity,
    companyType: CompanyType,
  ): Promise<boolean> {
    const requiredResource = this.getResourceByCompanyType(companyType);
    return this.hasManageOnResource(user, requiredResource);
  }

  /**
   * Récupère tous les utilisateurs d'une compagnie qui ont la permission canManage
   * sur une ressource spécifique
   */
  async getUsersWithManagePermissionOnResource(
    companyId: string,
    branchId: string,
    resourceName: string,
  ): Promise<string[]> {
    console.log(
      `🔍 [Helper] companyId=${companyId}, branchId=${branchId}, resourceName=${resourceName}`,
    );

    const resourceId = await this.getResourceId(resourceName);
    if (!resourceId) {
      console.log(`   ❌ Ressource ${resourceName} non trouvée`);
      return [];
    }

    const userCompanyRepo = this.dataSource.getRepository(UserHasCompanyEntity);
    const userCompanies = await userCompanyRepo.find({
      where: { company: { id: companyId } },
      relations: ['user'],
    });
    console.log(`   userCompanies count: ${userCompanies.length}`);
    const userCompanyIds = userCompanies.map((uc) => uc.id);
    if (userCompanyIds.length === 0) return [];

    const permissionRepo = this.dataSource.getRepository(
      CompanyHasUserResource,
    );
    const permissions = await permissionRepo.find({
      where: {
        userCompanyId: In(userCompanyIds),
        branchId: branchId,
        resourceId: resourceId,
      },
      relations: ['userCompany', 'userCompany.user'],
    });
    console.log(`   permissions count (raw): ${permissions.length}`);

    const userIds = permissions
      .filter((perm) => perm.canManage)
      .map((perm) => perm.userCompany?.user?.id)
      .filter((id): id is string => id != null);
    console.log(`   userIds after filter:`, userIds);
    return [...new Set(userIds)];
  }

  /**
   * Récupère tous les utilisateurs d'une compagnie qui ont une permission spécifique
   * sur une ressource donnée
   */
  async getUsersWithPermissionOnResource(
    companyId: string,
    branchId: string,
    resourceName: string,
    action: 'canCreate' | 'canRead' | 'canUpdate' | 'canDelete',
  ): Promise<string[]> {
    console.log(
      `🔍 [Helper] companyId=${companyId}, branchId=${branchId}, resourceName=${resourceName}, action=${action}`,
    );

    const resourceId = await this.getResourceId(resourceName);
    if (!resourceId) return [];

    const userCompanyRepo = this.dataSource.getRepository(UserHasCompanyEntity);
    const userCompanies = await userCompanyRepo.find({
      where: { company: { id: companyId } },
      relations: ['user'],
    });
    const userCompanyIds = userCompanies.map((uc) => uc.id);
    if (userCompanyIds.length === 0) return [];

    const permissionRepo = this.dataSource.getRepository(
      CompanyHasUserResource,
    );
    const permissions = await permissionRepo.find({
      where: {
        userCompanyId: In(userCompanyIds),
        branchId: branchId,
        resourceId: resourceId,
      },
      relations: ['userCompany', 'userCompany.user'],
    });

    const userIds = permissions
      .filter((perm) => {
        if (perm.canManage) return true;
        switch (action) {
          case 'canCreate':
            return perm.canCreate;
          case 'canRead':
            return perm.canRead;
          case 'canUpdate':
            return perm.canUpdate;
          case 'canDelete':
            return perm.canDelete;
          default:
            return false;
        }
      })
      .map((perm) => perm.userCompany?.user?.id)
      .filter((id): id is string => id != null);

    return [...new Set(userIds)];
  }

  /**
   * Récupère les utilisateurs d'une compagnie qui ont la permission canCreate
   * sur la ressource appropriée selon le type d'entreprise
   */
  async getUsersWithProductCreatePermission(
    companyId: string,
    branchId: string,
    companyType: CompanyType,
  ): Promise<string[]> {
    const requiredResource = this.getResourceByCompanyType(companyType);
    return this.getUsersWithPermissionOnResource(
      companyId,
      branchId,
      requiredResource,
      'canCreate',
    );
  }
}
