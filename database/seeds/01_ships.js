/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('ships').del();
  
  // Inserts seed entries
  await knex('ships').insert([
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'MV Atlantic Explorer',
      imo_number: '9123456',
      ship_type: 'Container Ship',
      engine_type: 'Diesel',
      capacity: 15000,
      length: 200.5,
      width: 32.2,
      draft: 12.5,
      max_speed: 22,
      fuel_capacity: 2500.0,
      specifications: {
        teu_capacity: 1200,
        crane_capacity: 40,
        ice_class: 'None'
      }
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      name: 'MV Pacific Voyager',
      imo_number: '9234567',
      ship_type: 'Bulk Carrier',
      engine_type: 'Diesel',
      capacity: 25000,
      length: 180.0,
      width: 28.0,
      draft: 14.2,
      max_speed: 18,
      fuel_capacity: 1800.0,
      specifications: {
        cargo_holds: 5,
        loading_rate: 1000,
        discharge_rate: 800
      }
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      name: 'MV Nordic Star',
      imo_number: '9345678',
      ship_type: 'Tanker',
      engine_type: 'Diesel',
      capacity: 50000,
      length: 250.0,
      width: 40.0,
      draft: 16.5,
      max_speed: 16,
      fuel_capacity: 3200.0,
      specifications: {
        tank_capacity: 50000,
        pump_rate: 2000,
        ice_class: 'IA'
      }
    }
  ]);
}; 