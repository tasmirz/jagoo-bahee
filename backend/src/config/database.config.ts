export const databaseConfig = {
  type: process.env.DATABASE_TYPE as 'postgres' | 'mysql',
  host: process.env.DATABASE_HOST as string,
  port: parseInt(process.env.DATABASE_PORT as string),
  username: '',
  password: '',
  database: '',
  synchronize: false
}

if (databaseConfig.type == 'postgres') {
  databaseConfig.username = process.env.POSTGRES_USER as string
  databaseConfig.password = process.env.POSTGRES_PASSWORD as string
  databaseConfig.database = process.env.POSTGRES_DB as string
}

if (process.env.NODE_ENV !== 'production') databaseConfig.synchronize = true
