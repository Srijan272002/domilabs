import knex from 'knex';
import config from '../config/database.config';
import { logger } from './logger';

// Initialize database connection
export const db = knex(config);

// Column name mapping utility
export const mapColumnNames = (camelCaseNames: string[]): { [key: string]: string } => {
  return camelCaseNames.reduce((acc, name) => {
    acc[name] = name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    return acc;
  }, {} as { [key: string]: string });
};

// Common column mappings
export const commonColumnMappings = mapColumnNames([
  'createdAt',
  'updatedAt',
  'shipId',
  'plannedDepartureTime',
  'actualDepartureTime',
  'estimatedArrivalTime',
  'actualArrivalTime'
]);

// Check database connection
export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Database connection failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
};

export default {
  db,
  mapColumnNames,
  commonColumnMappings,
  checkDatabaseConnection
}; 