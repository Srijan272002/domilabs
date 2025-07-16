/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('maintenance', function(table) {
    // Add alert_type column with maintenance_type as default
    table.string('alert_type').defaultTo(knex.raw("maintenance_type"));
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('maintenance', function(table) {
    table.dropColumn('alert_type');
  });
}; 