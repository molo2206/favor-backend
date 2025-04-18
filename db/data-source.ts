import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

config();
export const dataSourceOptions: DataSourceOptions = {
    type: 'mysql',
    host: 'localhost', // ✅ Remplace localhost par cette adresse
    port: 3306,
    username: 'admin',
    password: 'favor@2025',
    database: 'favor_bd',
    entities: ['dist/**/*.entity{.ts,.js}'],
    migrations: ['dist/db/migrations/*{.ts,.js}'],
    logging: false,
    synchronize: true,
};

const dataSource = new DataSource(dataSourceOptions);
//dataSource.initialize()
export default dataSource;
