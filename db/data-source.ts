import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

config();
export const dataSourceOptions: DataSourceOptions = {
    type: 'mysql',
    // host: '127.0.0.1', // ✅ Remplace localhost par cette adresse
    // port: 3306,
    // username: 'root',
    // password: '',
    // database: 'favor_db',
    host: process.env.DB_HOST,
    port: 3306,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: ['dist/**/*.entity{.ts,.js}'],
    migrations: ['dist/db/migrations/*{.ts,.js}'],
    logging: false,
    synchronize: true,
};

const dataSource = new DataSource(dataSourceOptions);
//dataSource.initialize()
export default dataSource;
