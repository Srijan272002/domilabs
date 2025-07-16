/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('fuel_logs', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('ship_id').notNullable().references('id').inTable('ships').onDelete('CASCADE');
    table.uuid('voyage_id').references('id').inTable('voyages').onDelete('SET NULL');
    table.timestamp('log_time').notNullable();
    table.decimal('fuel_consumed', 10, 2).notNullable(); // in tons
    table.decimal('fuel_remaining', 10, 2); // in tons
    table.decimal('current_speed', 5, 2); // in knots
    table.decimal('current_lat', 10, 8);
    table.decimal('current_lng', 11, 8);
    table.json('weather_conditions');
    table.decimal('engine_load', 5, 2); // percentage
    table.string('fuel_type');
    table.json('additional_metrics');
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('fuel_logs');
}; 