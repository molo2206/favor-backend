import { UserHasCompanyEntity } from "src/user_has_company/entities/user_has_company.entity";
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";

@Entity('company')
export class CompanyEntity {
    // Champs spécifiques aux fournisseurs

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ nullable: false })
    companyName?: string;

    @Column({ nullable: true })
    companyAddress?: string;

    @Column({ nullable: true })
    vatNumber?: string;

    @Column({ nullable: true })
    registrationDocumentUrl?: string;

    @Column({ nullable: true })
    warehouseLocation?: string;

    // Modifié le type de la colonne logo en varchar
    @Column({ nullable: true, type: 'varchar', length: 255 })
    logo: string | null;  // Permet de stocker l'URL ou le chemin du logo

    

    @OneToMany(() => UserHasCompanyEntity, (userHasCompany) => userHasCompany.company)
    userHasCompanies: UserHasCompanyEntity[];
}
