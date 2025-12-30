import { MigrationInterface, QueryRunner } from "typeorm";

export class TblUsers1743801955924 implements MigrationInterface {
    name = 'TblUsers1743801955924'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`otp_entity\` DROP FOREIGN KEY \`FK_d8d7d1cd42eafbb1d6c61b2ff37\``);
        await queryRunner.query(`ALTER TABLE \`otp_entity\` CHANGE \`expiresAt\` \`expiresAt\` timestamp NULL`);
        await queryRunner.query(`ALTER TABLE \`otp_entity\` CHANGE \`userId\` \`userId\` varchar(36) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`address\` \`address\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`preferredLanguage\` \`preferredLanguage\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`loyaltyPoints\` \`loyaltyPoints\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`dateOfBirth\` \`dateOfBirth\` datetime NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`vehicleType\` \`vehicleType\` enum ('MOTO', 'CAMION', 'VÉLO', 'VOITURE') NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`plateNumber\` \`plateNumber\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`licenseDocumentUrl\` \`licenseDocumentUrl\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`company\` CHANGE \`companyAddress\` \`companyAddress\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`company\` CHANGE \`logo\` \`logo\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`company\` CHANGE \`vatNumber\` \`vatNumber\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`company\` CHANGE \`registrationDocumentUrl\` \`registrationDocumentUrl\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`company\` CHANGE \`warehouseLocation\` \`warehouseLocation\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`otp_entity\` ADD CONSTRAINT \`FK_d8d7d1cd42eafbb1d6c61b2ff37\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`otp_entity\` DROP FOREIGN KEY \`FK_d8d7d1cd42eafbb1d6c61b2ff37\``);
        await queryRunner.query(`ALTER TABLE \`company\` CHANGE \`warehouseLocation\` \`warehouseLocation\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`company\` CHANGE \`registrationDocumentUrl\` \`registrationDocumentUrl\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`company\` CHANGE \`vatNumber\` \`vatNumber\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`company\` CHANGE \`logo\` \`logo\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`company\` CHANGE \`companyAddress\` \`companyAddress\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`licenseDocumentUrl\` \`licenseDocumentUrl\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`plateNumber\` \`plateNumber\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`vehicleType\` \`vehicleType\` enum ('MOTO', 'CAMION', 'VÉLO', 'VOITURE') NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`dateOfBirth\` \`dateOfBirth\` datetime NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`loyaltyPoints\` \`loyaltyPoints\` int NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`preferredLanguage\` \`preferredLanguage\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`address\` \`address\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`otp_entity\` CHANGE \`userId\` \`userId\` varchar(36) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`otp_entity\` CHANGE \`expiresAt\` \`expiresAt\` timestamp NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`otp_entity\` ADD CONSTRAINT \`FK_d8d7d1cd42eafbb1d6c61b2ff37\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
