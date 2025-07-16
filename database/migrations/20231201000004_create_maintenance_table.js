/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('maintenance', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('ship_id').notNullable().references('id').inTable('ships').onDelete('CASCADE');
    table.string('maintenance_type').notNullable(); // scheduled, unscheduled, emergency
    table.string('component').notNullable(); // engine, hull, navigation, etc.
    table.string('description').notNullable();
    table.timestamp('scheduled_date');
    table.timestamp('completed_date');
    table.string('status').defaultTo('scheduled'); // scheduled, in_progress, completed, cancelled
    table.decimal('cost', 12, 2);
    table.string('performed_by');
    table.text('notes');
    table.integer('hours_required');
    table.integer('actual_hours');
    table.string('priority').defaultTo('medium'); // low, medium, high, critical
    table.json('parts_used');
    table.decimal('next_service_hours', 10, 2); // operating hours until next service
    table.timestamp('ai_predicted_date'); // AI prediction for next maintenance
    table.decimal('ai_confidence_score', 3, 2); // confidence in AI prediction (0-1)
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('maintenance');
}; 