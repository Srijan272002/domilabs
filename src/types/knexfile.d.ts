import { Knex } from 'knex';

// Define the configuration interface
export interface KnexConfig {
  [key: string]: Knex.Config;
}

// Augment the module type without redeclaring the config variable
declare module '../../knexfile' {
  import { KnexConfig } from './knexfile';
  export = KnexConfig;
} 