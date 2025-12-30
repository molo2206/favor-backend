import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

config();
export const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  host: 'localhost',
  port: 3306,

  // username: 'admin',
  // password: 'Favor@2025',
  // database: 'favor_db',

  username: 'root',
  password: '',
  database: 'favor_db1',

  entities: ['dist/**/*.entity{.ts,.js}'],
  migrations: ['dist/db/migrations/*{.ts,.js}'],
  logging: false,
  synchronize: true,
};

const dataSource = new DataSource(dataSourceOptions);
//dataSource.initialize()
export default dataSource;
