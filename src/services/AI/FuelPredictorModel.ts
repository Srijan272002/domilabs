import * as tf from '@tensorflow/tfjs-node';
import { BaseModel, ModelConfig, TrainingData } from './BaseModel';
import { logger } from '../../utils/logger';

export interface FuelPredictionInput {
  voyage: {
    distance: number; // nautical miles
    duration: number; // hours
    averageSpeed: number; // knots
  };
  ship: {
    type: 'cargo' | 'tanker' | 'container' | 'bulk' | 'passenger';
    length: number; // meters
    beam: number; // meters
    displacement: number; // tons
    enginePower: number; // kW
    maxSpeed: number; // knots
    cargoWeight: number; // tons
    cargoCapacity: number; // tons
  };
  conditions: {
    windSpeed: number; // knots
    windDirection: number; // degrees (relative to ship heading)
    waveHeight: number; // meters
    currentSpeed: number; // knots
    currentDirection: number; // degrees
    temperature: number; // Celsius
    seaState: number; // 0-9 scale
  };
  operational: {
    cruisingSpeed: number; // knots
    loadFactor: number; // 0-1 (cargo weight / capacity)
    mainEngineLoad: number; // 0-1
    auxiliaryLoad: number; // 0-1
    hvacLoad: number; // 0-1
  };
}

export interface FuelPrediction {
  totalConsumption: number; // liters
  consumptionRate: number; // liters per hour
  mainEngineConsumption: number; // liters
  auxiliaryConsumption: number; // liters
  efficiency: number; // liters per nautical mile
  co2Emissions: number; // kg
  confidence: number; // 0-1
  factors: {
    weatherImpact: number; // percentage impact
    loadImpact: number; // percentage impact
    speedImpact: number; // percentage impact
    seaStateImpact: number; // percentage impact
  };
}

export class FuelPredictorModel extends BaseModel {
  private static readonly FUEL_DENSITY = 0.845; // kg/liter for marine fuel
  private static readonly CO2_FACTOR = 3.15; // kg CO2 per kg fuel

  constructor() {
    const config: ModelConfig = {
      modelName: 'fuel-predictor',
      version: '1.0.0',
      inputShape: [20], // Comprehensive input features
      outputShape: [3], // main_consumption, aux_consumption, efficiency_factor
      learningRate: 0.0005,
      epochs: 200,
      batchSize: 64
    };
    super(config);
  }

  buildModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [20],
          units: 128,
          activation: 'relu',
          kernelInitializer: 'glorotUniform'
        }),
        tf.layers.batchNormalization(),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({
          units: 64,
          activation: 'relu'
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 32,
          activation: 'relu'
        }),
        tf.layers.dropout({ rate: 0.1 }),
        tf.layers.dense({
          units: 16,
          activation: 'relu'
        }),
        tf.layers.dense({
          units: 3,
          activation: 'linear' // Linear output for regression
        })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(this.config.learningRate || 0.0005),
      loss: 'meanSquaredError',
      metrics: ['mae', 'mse']
    });

    return model;
  }

  preprocessInput(data: FuelPredictionInput): number[] {
    const { voyage, ship, conditions, operational } = data;

    // Normalize ship type
    const shipTypeVector = this.encodeShipType(ship.type);

    // Normalize all features to 0-1 range
    const features = [
      voyage.distance / 10000,              // Max 10,000 nm
      voyage.duration / 500,                // Max 500 hours
      voyage.averageSpeed / 35,             // Max 35 knots
      ship.length / 400,                    // Max 400m
      ship.beam / 60,                       // Max 60m
      ship.displacement / 100000,           // Max 100,000 tons
      ship.enginePower / 50000,             // Max 50,000 kW
      ship.maxSpeed / 35,                   // Max 35 knots
      ship.cargoWeight / ship.cargoCapacity, // Load ratio
      conditions.windSpeed / 60,            // Max 60 knots
      Math.cos((conditions.windDirection * Math.PI) / 180), // Wind direction cosine
      Math.sin((conditions.windDirection * Math.PI) / 180), // Wind direction sine
      conditions.waveHeight / 15,           // Max 15m
      conditions.currentSpeed / 10,         // Max 10 knots
      Math.cos((conditions.currentDirection * Math.PI) / 180), // Current direction
      conditions.temperature / 50,          // Max 50°C
      conditions.seaState / 9,              // 0-9 scale
      operational.cruisingSpeed / 35,       // Max 35 knots
      operational.mainEngineLoad,           // 0-1
      operational.auxiliaryLoad             // 0-1
    ];

    return features;
  }

  private encodeShipType(type: string): number {
    const typeMap: { [key: string]: number } = {
      'cargo': 0.2,
      'tanker': 0.4,
      'container': 0.6,
      'bulk': 0.8,
      'passenger': 1.0
    };
    return typeMap[type] || 0.5;
  }

  postprocessOutput(prediction: tf.Tensor): number[] {
    const values = prediction.dataSync();
    return Array.from(values);
  }

  async predictFuelConsumption(input: FuelPredictionInput): Promise<FuelPrediction> {
    try {
      const prediction = await this.predict(input);
      const [mainConsumptionFactor, auxConsumptionFactor, efficiencyFactor] = prediction.prediction;

      // Calculate base consumption using ship specifications
      const baseMainConsumption = this.calculateBaseMainEngineConsumption(input);
      const baseAuxConsumption = this.calculateBaseAuxiliaryConsumption(input);

      // Apply AI prediction factors
      const mainEngineConsumption = baseMainConsumption * (1 + mainConsumptionFactor * 0.5);
      const auxiliaryConsumption = baseAuxConsumption * (1 + auxConsumptionFactor * 0.3);
      const totalConsumption = mainEngineConsumption + auxiliaryConsumption;

      // Calculate metrics
      const consumptionRate = totalConsumption / input.voyage.duration;
      const efficiency = totalConsumption / input.voyage.distance;
      const co2Emissions = totalConsumption * FuelPredictorModel.FUEL_DENSITY * FuelPredictorModel.CO2_FACTOR;

      // Calculate impact factors
      const factors = this.calculateImpactFactors(input);

      logger.info('Fuel consumption predicted', {
        totalConsumption,
        efficiency,
        confidence: prediction.confidence,
        modelVersion: prediction.modelVersion
      });

      return {
        totalConsumption,
        consumptionRate,
        mainEngineConsumption,
        auxiliaryConsumption,
        efficiency,
        co2Emissions,
        confidence: prediction.confidence,
        factors
      };
    } catch (error) {
      logger.error('Fuel prediction failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private calculateBaseMainEngineConsumption(input: FuelPredictionInput): number {
    const { voyage, ship, operational } = input;
    
    // Base consumption model: Power × Load × Time × SFOC (Specific Fuel Oil Consumption)
    const sfoc = 190; // g/kWh typical for marine engines
    const powerUsed = ship.enginePower * operational.mainEngineLoad;
    const baseConsumption = (powerUsed * voyage.duration * sfoc) / 1000; // Convert to liters
    
    // Apply speed factor (cubic relationship)
    const speedFactor = Math.pow(operational.cruisingSpeed / ship.maxSpeed, 3);
    
    // Apply load factor
    const loadFactor = 1 + (operational.loadFactor * 0.15); // Up to 15% increase for full load
    
    return baseConsumption * speedFactor * loadFactor;
  }

  private calculateBaseAuxiliaryConsumption(input: FuelPredictionInput): number {
    const { voyage, ship, operational } = input;
    
    // Auxiliary engines for hotel load, cargo pumps, etc.
    const auxPower = ship.enginePower * 0.1; // Assume 10% of main engine power
    const sfoc = 210; // g/kWh for auxiliary engines (slightly higher)
    const baseConsumption = (auxPower * operational.auxiliaryLoad * voyage.duration * sfoc) / 1000;
    
    // HVAC and hotel load factor
    const hvacFactor = 1 + (operational.hvacLoad * 0.2);
    
    return baseConsumption * hvacFactor;
  }

  private calculateImpactFactors(input: FuelPredictionInput): {
    weatherImpact: number;
    loadImpact: number;
    speedImpact: number;
    seaStateImpact: number;
  } {
    const { conditions, operational, ship } = input;

    // Weather impact calculation
    const windImpact = Math.min(30, (conditions.windSpeed / 30) * 15); // Max 15% impact
    const waveImpact = Math.min(20, (conditions.waveHeight / 8) * 12); // Max 12% impact
    const weatherImpact = windImpact + waveImpact;

    // Load impact
    const loadImpact = operational.loadFactor * 15; // Up to 15% for full load

    // Speed impact (exponential relationship)
    const speedRatio = operational.cruisingSpeed / ship.maxSpeed;
    const speedImpact = (Math.pow(speedRatio, 3) - Math.pow(0.7, 3)) * 50; // Reference at 70% max speed

    // Sea state impact
    const seaStateImpact = (conditions.seaState / 9) * 10; // Up to 10% for rough seas

    return {
      weatherImpact: Math.round(weatherImpact * 100) / 100,
      loadImpact: Math.round(loadImpact * 100) / 100,
      speedImpact: Math.round(speedImpact * 100) / 100,
      seaStateImpact: Math.round(seaStateImpact * 100) / 100
    };
  }

  async generateTrainingData(sampleSize: number): Promise<TrainingData> {
    const inputs: number[][] = [];
    const outputs: number[][] = [];

    for (let i = 0; i < sampleSize; i++) {
      // Generate random voyage data
      const voyage = {
        distance: 1000 + Math.random() * 4000, // 1000-5000 nautical miles
        duration: 48 + Math.random() * 240, // 48-288 hours
        averageSpeed: 15 + Math.random() * 10 // 15-25 knots
      };

      // Generate random ship data
      const ship = {
        type: Math.random() > 0.5 ? "container" : "bulk",
        length: 200 + Math.random() * 200, // 200-400 meters
        beam: 30 + Math.random() * 30, // 30-60 meters
        displacement: 30000 + Math.random() * 40000, // 30000-70000 tons
        enginePower: 15000 + Math.random() * 20000, // 15000-35000 kW
        maxSpeed: 20 + Math.random() * 10, // 20-30 knots
        cargoWeight: 20000 + Math.random() * 40000, // 20000-60000 tons
        cargoCapacity: 40000 + Math.random() * 30000 // 40000-70000 tons
      };

      // Generate random conditions
      const conditions = {
        windSpeed: Math.random() * 40, // 0-40 knots
        windDirection: Math.random() * 360, // 0-360 degrees
        waveHeight: Math.random() * 8, // 0-8 meters
        currentSpeed: Math.random() * 4, // 0-4 knots
        currentDirection: Math.random() * 360, // 0-360 degrees
        temperature: 10 + Math.random() * 25, // 10-35 degrees Celsius
        seaState: Math.floor(Math.random() * 9) // 0-8 Beaufort scale
      };

      // Generate random operational data
      const operational = {
        cruisingSpeed: ship.maxSpeed * (0.7 + Math.random() * 0.2), // 70-90% of max speed
        loadFactor: 0.4 + Math.random() * 0.5, // 40-90% load
        mainEngineLoad: 0.5 + Math.random() * 0.4, // 50-90% load
        auxiliaryLoad: 0.3 + Math.random() * 0.4, // 30-70% load
        hvacLoad: 0.2 + Math.random() * 0.5 // 20-70% load
      };

      // Create normalized input vector
      const input = [
        voyage.distance / 5000, // Normalize to 0-1
        voyage.duration / 288,
        voyage.averageSpeed / 25,
        ship.length / 400,
        ship.beam / 60,
        ship.displacement / 70000,
        ship.enginePower / 35000,
        ship.maxSpeed / 30,
        ship.cargoWeight / ship.cargoCapacity,
        conditions.windSpeed / 40,
        conditions.windDirection / 360,
        conditions.waveHeight / 8,
        conditions.currentSpeed / 4,
        conditions.currentDirection / 360,
        conditions.temperature / 35,
        conditions.seaState / 8,
        operational.cruisingSpeed / ship.maxSpeed,
        operational.loadFactor,
        operational.mainEngineLoad,
        operational.auxiliaryLoad
      ];

      // Calculate synthetic fuel consumption outputs
      const mainConsumption = this.calculateMainEngineConsumption(input);
      const auxConsumption = this.calculateAuxiliaryConsumption(input);
      const efficiencyFactor = this.calculateEfficiencyFactor(input);

      inputs.push(input);
      outputs.push([mainConsumption, auxConsumption, efficiencyFactor]);
    }

    return {
      inputs,
      outputs,
      validationSplit: 0.2
    };
  }

  private calculateMainEngineConsumption(input: number[]): number {
    // Main engine consumption calculation based on multiple factors
    const distanceFactor = input[0];
    const speedFactor = input[2];
    const displacementFactor = input[5];
    const engineLoadFactor = input[18];
    const weatherImpact = (input[9] + input[11]) / 2; // wind and wave impact

    let consumption = (
      distanceFactor * 0.2 +
      speedFactor * 0.3 +
      displacementFactor * 0.2 +
      engineLoadFactor * 0.2 +
      weatherImpact * 0.1
    );

    return Math.max(0, Math.min(1, consumption));
  }

  private calculateAuxiliaryConsumption(input: number[]): number {
    // Auxiliary consumption based on operational factors
    const auxLoadFactor = input[19];
    const tempFactor = input[14];
    const cargoFactor = input[8];

    let consumption = (
      auxLoadFactor * 0.5 +
      tempFactor * 0.3 +
      cargoFactor * 0.2
    );

    return Math.max(0, Math.min(1, consumption));
  }

  private calculateEfficiencyFactor(input: number[]): number {
    // Overall efficiency factor
    const speedEfficiency = 1 - Math.abs(0.8 - input[16]); // optimal at 80% of max speed
    const loadEfficiency = 1 - Math.abs(0.75 - input[17]); // optimal at 75% load
    const weatherImpact = 1 - (input[9] + input[11]) / 2;

    let efficiency = (
      speedEfficiency * 0.4 +
      loadEfficiency * 0.4 +
      weatherImpact * 0.2
    );

    return Math.max(0, Math.min(1, efficiency));
  }

  async analyzeFuelTrends(historicalData: FuelPredictionInput[]): Promise<{
    averageConsumption: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    seasonalFactors: { [month: string]: number };
    recommendations: string[];
  }> {
    const consumptions = [];
    
    for (const data of historicalData) {
      try {
        const prediction = await this.predictFuelConsumption(data);
        consumptions.push(prediction.totalConsumption);
      } catch (error) {
        logger.warn('Failed to predict fuel for historical data point', { error });
      }
    }

    const averageConsumption = consumptions.reduce((a, b) => a + b, 0) / consumptions.length;
    
    // Simple trend analysis
    const firstHalf = consumptions.slice(0, Math.floor(consumptions.length / 2));
    const secondHalf = consumptions.slice(Math.floor(consumptions.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    let trend: 'increasing' | 'decreasing' | 'stable';
    const change = (secondAvg - firstAvg) / firstAvg;
    
    if (change > 0.05) trend = 'increasing';
    else if (change < -0.05) trend = 'decreasing';
    else trend = 'stable';

    // Generate recommendations
    const recommendations = [];
    if (trend === 'increasing') {
      recommendations.push('Consider route optimization to reduce fuel consumption');
      recommendations.push('Review engine maintenance schedule');
      recommendations.push('Evaluate speed management strategies');
    }
    if (averageConsumption > 1000) {
      recommendations.push('Consider fuel-efficient routing');
      recommendations.push('Monitor weather patterns for optimal departure times');
    }

    return {
      averageConsumption,
      trend,
      seasonalFactors: {}, // Simplified - could be enhanced with actual seasonal analysis
      recommendations
    };
  }
} 