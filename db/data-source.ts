import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

config();
export const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  host: '127.0.0.1',
  port: 3306,

  username: 'admin',
  password: 'admin2025',
  database: 'favor_db',

  // username: 'admin',
  // password: 'admin2025',
  // database: 'favor_db1',

  // username: 'root',
  // password: '',
  // database: 'favor_db1',

  entities: ['dist/**/*.entity{.ts,.js}'],
  migrations: ['dist/db/migrations/*{.ts,.js}'],
  logging: false,
  synchronize: false,

  extra: {
    charset: 'utf8mb4',
  },
};

const dataSource = new DataSource(dataSourceOptions);
//dataSource.initialize()
export default dataSource;
