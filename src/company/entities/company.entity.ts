import { Product } from "src/products/entities/product.entity";
import { TypeCompany } from "src/type_company/entities/type_company.entity";
import { UserHasCompanyEntity } from "src/user_has_company/entities/user_has_company.entity";
import { CompanyStatus } from "src/users/utility/common/company-status.enum";
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";

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

    @Column({ type: 'enum', enum: CompanyStatus, default: CompanyStatus.PENDING, })
    status: CompanyStatus;

    @OneToMany(() => UserHasCompanyEntity, (userHasCompany) => userHasCompany.company)
    userHasCompanies: UserHasCompanyEntity[];

    @ManyToOne(() => TypeCompany, { nullable: true })
    @JoinColumn({ name: 'type_company_id' })
    typeCompany: TypeCompany | null | undefined;

    @OneToMany(() => Product, product => product.company)
    products: Product[];

}
