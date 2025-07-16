/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('voyages', function(table) {
    // Add estimated_arrival_time column with estimated_arrival as default
    table.timestamp('estimated_arrival_time').defaultTo(knex.raw("estimated_arrival"));
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('voyages', function(table) {
    table.dropColumn('estimated_arrival_time');
  });
}; 