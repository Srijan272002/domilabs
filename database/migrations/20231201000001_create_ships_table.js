/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('ships', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('imo_number').unique().notNullable();
    table.string('ship_type').notNullable();
    table.string('engine_type').notNullable();
    table.integer('capacity').notNullable(); // in tons
    table.decimal('length', 8, 2); // in meters
    table.decimal('width', 8, 2); // in meters
    table.decimal('draft', 8, 2); // in meters
    table.integer('max_speed').notNullable(); // in knots
    table.decimal('fuel_capacity', 10, 2); // in tons
    table.json('specifications'); // additional technical specs
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('ships');
}; 