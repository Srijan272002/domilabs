/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('voyages', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('ship_id').notNullable().references('id').inTable('ships').onDelete('CASCADE');
    table.string('origin').notNullable();
    table.string('destination').notNullable();
    table.decimal('origin_lat', 10, 8);
    table.decimal('origin_lng', 11, 8);
    table.decimal('destination_lat', 10, 8);
    table.decimal('destination_lng', 11, 8);
    table.timestamp('departure_time').notNullable();
    table.timestamp('estimated_arrival').notNullable();
    table.timestamp('actual_arrival');
    table.decimal('cargo_weight', 10, 2); // in tons
    table.string('cargo_type');
    table.json('weather_forecast');
    table.json('planned_route');
    table.json('actual_route');
    table.decimal('estimated_fuel_consumption', 10, 2);
    table.decimal('actual_fuel_consumption', 10, 2);
    table.decimal('estimated_distance', 10, 2); // in nautical miles
    table.decimal('actual_distance', 10, 2); // in nautical miles
    table.string('status').defaultTo('planned'); // planned, in_progress, completed, cancelled
    table.json('optimization_parameters');
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('voyages');
}; 