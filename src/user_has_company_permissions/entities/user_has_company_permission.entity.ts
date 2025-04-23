import { PermissionEntity } from "src/permissions/entities/permission.entity";
import { UserHasCompanyEntity } from "src/user_has_company/entities/user_has_company.entity";
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity('assign_permissions')
export class UserHasCompanyPermissionEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => UserHasCompanyEntity, (uhc) => uhc.permissions)
    userHasCompany: UserHasCompanyEntity;

    @ManyToOne(() => PermissionEntity, { eager: true })
    permission: PermissionEntity;

    @Column({ default: false })
    create: boolean;

    @Column({ default: false })
    read: boolean;

    @Column({ default: false })
    update: boolean;

    @Column({ default: false })
    delete: boolean;

    @Column({ default: false })
    status: boolean;
}
