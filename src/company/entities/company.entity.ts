import { MeasureEntity } from "src/measure/entities/measure.entity";
import { Product } from "src/products/entities/product.entity";
import { UserHasCompanyEntity } from "src/user_has_company/entities/user_has_company.entity";
import { CompanyActivity } from "src/users/utility/common/activity.company.enum";
import { CompanyStatus } from "src/users/utility/common/company-status.enum";
import { CompanyType } from "src/users/utility/common/type.company.enum";
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

    @Column({ type: 'enum', enum: CompanyStatus, default: CompanyStatus.PENDING, })
    status: CompanyStatus;

    @OneToMany(() => UserHasCompanyEntity, (userHasCompany) => userHasCompany.company)
    userHasCompany: UserHasCompanyEntity[];

    @Column({ type: 'enum', enum: CompanyType })
    typeCompany: CompanyType;

    @OneToMany(() => Product, product => product.company)
    products: Product[];

    @Column({ nullable: true })
    email: string;

    @Column()
    phone: string;

    @Column({ nullable: true })
    website: string;

    @Column({
        type: 'enum',
        enum: CompanyActivity,
        default: CompanyActivity.RETAILER,
    })
    companyActivity: CompanyActivity;

    @OneToMany(() => MeasureEntity, (measure) => measure.company)
    measures: MeasureEntity[];
}
