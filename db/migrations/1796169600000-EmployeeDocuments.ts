import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ RH : dossiers des employés.
 *    Script SQL équivalent : db/sql/dossiers_employes.sql
 */
export class EmployeeDocuments1796169600000 implements MigrationInterface {
  name = 'EmployeeDocuments1796169600000';

  public async up(q: QueryRunner): Promise<void> {
    if (await q.hasTable('hr_employee_documents')) return;
    await q.query(`CREATE TABLE \`hr_employee_documents\` (
      \`id\` varchar(36) NOT NULL,
      \`employeeId\` varchar(36) NOT NULL,
      \`companyId\` varchar(36) NULL,
      \`category\` varchar(30) NOT NULL DEFAULT 'OTHER',
      \`title\` varchar(200) NOT NULL,
      \`description\` varchar(1000) NULL,
      \`documentNumber\` varchar(100) NULL,
      \`issuedAt\` date NULL,
      \`expiresAt\` date NULL,
      \`storagePath\` varchar(300) NOT NULL,
      \`originalName\` varchar(255) NOT NULL,
      \`mimeType\` varchar(120) NOT NULL,
      \`sizeBytes\` int NOT NULL,
      \`uploadedById\` varchar(36) NULL,
      \`uploadedByName\` varchar(150) NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      KEY \`idx_hr_emp_doc_employee\` (\`employeeId\`, \`category\`),
      KEY \`idx_hr_emp_doc_company_exp\` (\`companyId\`, \`expiresAt\`),
      CONSTRAINT \`fk_hr_emp_doc_employee\` FOREIGN KEY (\`employeeId\`) REFERENCES \`hr_employees\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `hr_employee_documents`');
  }
}
