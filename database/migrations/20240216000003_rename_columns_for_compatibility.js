/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    .raw('ALTER TABLE voyages RENAME COLUMN estimated_arrival TO estimated_arrival_time')
    .raw('ALTER TABLE maintenance RENAME COLUMN maintenance_type TO alert_type');
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .raw('ALTER TABLE voyages RENAME COLUMN estimated_arrival_time TO estimated_arrival')
    .raw('ALTER TABLE maintenance RENAME COLUMN alert_type TO maintenance_type');
}; 