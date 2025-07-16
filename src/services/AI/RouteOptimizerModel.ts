import * as tf from '@tensorflow/tfjs-node';
import { BaseModel, ModelConfig, PredictionResult, TrainingData } from './BaseModel';
import { logger } from '../../utils/logger';

export interface RouteInput {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  shipSpecs: {
    maxSpeed: number;
    fuelCapacity: number;
    cargoCapacity: number;
    currentCargoWeight: number;
  };
  weatherConditions: {
    windSpeed: number;
    waveHeight: number;
    visibility: number;
    temperature: number;
  };
  preferences: {
    prioritizeFuel: boolean;
    prioritizeTime: boolean;
    avoidRoughSeas: boolean;
  };
}

export interface RouteOptimization {
  optimizedRoute: Array<{ latitude: number; longitude: number }>;
  estimatedTime: number; // in hours
  estimatedFuelConsumption: number; // in liters
  weatherRiskScore: number; // 0-1 scale
  totalDistance: number; // in nautical miles
  alternativeRoutes?: Array<{
    route: Array<{ latitude: number; longitude: number }>;
    time: number;
    fuel: number;
    risk: number;
  }>;
}

export class RouteOptimizerModel extends BaseModel {
  constructor() {
    const config: ModelConfig = {
      modelName: 'route-optimizer',
      version: '1.0.0',
      inputShape: [15], // Features: lat1, lon1, lat2, lon2, speed, cargo, weather (4), preferences (3), distance
      outputShape: [4], // Outputs: time_factor, fuel_factor, risk_score, route_efficiency
      learningRate: 0.001,
      epochs: 150,
      batchSize: 32
    };
    super(config);
  }

  buildModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [15],
          units: 64,
          activation: 'relu',
          kernelInitializer: 'glorotUniform'
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
          units: 4,
          activation: 'sigmoid' // Output values between 0 and 1
        })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(this.config.learningRate || 0.001),
      loss: 'meanSquaredError',
      metrics: ['mae']
    });

    return model;
  }

  preprocessInput(data: RouteInput): number[] {
    const {
      origin,
      destination,
      shipSpecs,
      weatherConditions,
      preferences
    } = data;

    // Calculate base distance
    const distance = this.calculateDistance(origin, destination);

    // Normalize inputs
    const features = [
      origin.latitude / 90,           // Normalized latitude (-1 to 1)
      origin.longitude / 180,         // Normalized longitude (-1 to 1)
      destination.latitude / 90,
      destination.longitude / 180,
      shipSpecs.maxSpeed / 30,        // Normalized speed (assuming max 30 knots)
      shipSpecs.currentCargoWeight / shipSpecs.cargoCapacity, // Cargo load ratio
      weatherConditions.windSpeed / 50,     // Normalized wind speed (max 50 knots)
      weatherConditions.waveHeight / 10,    // Normalized wave height (max 10m)
      weatherConditions.visibility / 10,    // Normalized visibility (max 10km)
      weatherConditions.temperature / 50,   // Normalized temperature (max 50°C)
      preferences.prioritizeFuel ? 1 : 0,
      preferences.prioritizeTime ? 1 : 0,
      preferences.avoidRoughSeas ? 1 : 0,
      distance / 5000,               // Normalized distance (max 5000 nm)
      Math.sin((new Date().getMonth()) * Math.PI / 6) // Seasonal factor
    ];

    return features;
  }

  postprocessOutput(prediction: tf.Tensor): number[] {
    const values = prediction.dataSync();
    return Array.from(values);
  }

  async optimizeRoute(input: RouteInput): Promise<RouteOptimization> {
    try {
      const prediction = await this.predict(input);
      const [timeFactor, fuelFactor, riskScore, routeEfficiency] = prediction.prediction;

      // Calculate base metrics
      const distance = this.calculateDistance(input.origin, input.destination);
      const baseTime = this.calculateBaseTime(distance, input.shipSpecs.maxSpeed);
      const baseFuel = this.calculateBaseFuelConsumption(distance, input.shipSpecs);

      // Apply AI optimization factors
      const estimatedTime = baseTime * (1 + timeFactor * 0.5); // AI can improve time by up to 50%
      const estimatedFuelConsumption = baseFuel * (1 + fuelFactor * 0.3); // AI can improve fuel by up to 30%

      // Generate optimized route (simplified - could be enhanced with actual waypoint optimization)
      const optimizedRoute = this.generateOptimizedWaypoints(
        input.origin,
        input.destination,
        input.weatherConditions,
        routeEfficiency
      );

      // Generate alternative routes
      const alternativeRoutes = this.generateAlternativeRoutes(
        input.origin,
        input.destination,
        input.weatherConditions
      );

      logger.info('Route optimization completed', {
        distance,
        estimatedTime,
        estimatedFuelConsumption,
        riskScore,
        confidence: prediction.confidence
      });

      return {
        optimizedRoute,
        estimatedTime,
        estimatedFuelConsumption,
        weatherRiskScore: riskScore,
        totalDistance: distance,
        alternativeRoutes
      };
    } catch (error) {
      logger.error('Route optimization failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private calculateDistance(
    point1: { latitude: number; longitude: number },
    point2: { latitude: number; longitude: number }
  ): number {
    // Haversine formula for calculating distance between two points on Earth
    const R = 3440.065; // Earth's radius in nautical miles
    const lat1Rad = (point1.latitude * Math.PI) / 180;
    const lat2Rad = (point2.latitude * Math.PI) / 180;
    const deltaLatRad = ((point2.latitude - point1.latitude) * Math.PI) / 180;
    const deltaLonRad = ((point2.longitude - point1.longitude) * Math.PI) / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private calculateBaseTime(distance: number, speed: number): number {
    // Base time calculation without weather factors
    return distance / speed; // hours
  }

  private calculateBaseFuelConsumption(
    distance: number,
    shipSpecs: { maxSpeed: number; fuelCapacity: number; cargoCapacity: number; currentCargoWeight: number }
  ): number {
    // Simplified fuel consumption model
    const baseConsumption = distance * 0.3; // Base: 0.3 liters per nautical mile
    const cargoFactor = 1 + (shipSpecs.currentCargoWeight / shipSpecs.cargoCapacity) * 0.2; // Up to 20% increase
    const speedFactor = Math.pow(shipSpecs.maxSpeed / 20, 2); // Quadratic relationship with speed
    
    return baseConsumption * cargoFactor * speedFactor;
  }

  private generateOptimizedWaypoints(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    weather: { windSpeed: number; waveHeight: number; visibility: number; temperature: number },
    efficiency: number
  ): Array<{ latitude: number; longitude: number }> {
    const waypoints = [origin];

    // Simple route optimization - can be enhanced with more sophisticated algorithms
    const numWaypoints = Math.max(2, Math.floor(efficiency * 10)); // More efficient routes have more waypoints
    
    for (let i = 1; i < numWaypoints; i++) {
      const progress = i / numWaypoints;
      
      // Linear interpolation with weather-based adjustments
      const lat = origin.latitude + (destination.latitude - origin.latitude) * progress;
      const lon = origin.longitude + (destination.longitude - origin.longitude) * progress;
      
      // Add small weather-based deviations
      const weatherDeviation = (weather.windSpeed + weather.waveHeight) / 100;
      const latAdjustment = (Math.random() - 0.5) * weatherDeviation;
      const lonAdjustment = (Math.random() - 0.5) * weatherDeviation;
      
      waypoints.push({
        latitude: lat + latAdjustment,
        longitude: lon + lonAdjustment
      });
    }

    waypoints.push(destination);
    return waypoints;
  }

  private generateAlternativeRoutes(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    weather: { windSpeed: number; waveHeight: number; visibility: number; temperature: number }
  ): Array<{
    route: Array<{ latitude: number; longitude: number }>;
    time: number;
    fuel: number;
    risk: number;
  }> {
    const alternatives = [];

    // Generate 2 alternative routes
    for (let i = 0; i < 2; i++) {
      const routeVariation = (i + 1) * 0.1; // 10% and 20% variations
      const route = [];

      // Create slightly different route
      const waypoints = 5;
      for (let j = 0; j <= waypoints; j++) {
        const progress = j / waypoints;
        let lat = origin.latitude + (destination.latitude - origin.latitude) * progress;
        let lon = origin.longitude + (destination.longitude - origin.longitude) * progress;

        // Add variation
        if (j > 0 && j < waypoints) {
          lat += (Math.random() - 0.5) * routeVariation;
          lon += (Math.random() - 0.5) * routeVariation;
        }

        route.push({ latitude: lat, longitude: lon });
      }

      // Calculate metrics for alternative route
      const distance = this.calculateTotalRouteDistance(route);
      const time = distance / 20; // Assuming 20 knots average speed
      const fuel = distance * 0.35; // Slightly higher consumption
      const risk = Math.min(1, (weather.windSpeed + weather.waveHeight) / 30);

      alternatives.push({ route, time, fuel, risk });
    }

    return alternatives;
  }

  private calculateTotalRouteDistance(route: Array<{ latitude: number; longitude: number }>): number {
    let totalDistance = 0;
    for (let i = 1; i < route.length; i++) {
      totalDistance += this.calculateDistance(route[i - 1], route[i]);
    }
    return totalDistance;
  }

  async generateTrainingData(sampleSize: number): Promise<TrainingData> {
    const inputs: number[][] = [];
    const outputs: number[][] = [];

    for (let i = 0; i < sampleSize; i++) {
      // Generate random coordinates within reasonable bounds
      const origin = {
        latitude: Math.random() * 180 - 90,
        longitude: Math.random() * 360 - 180
      };
      const destination = {
        latitude: Math.random() * 180 - 90,
        longitude: Math.random() * 360 - 180
      };

      // Generate random ship specs
      const shipSpecs = {
        maxSpeed: 15 + Math.random() * 20, // 15-35 knots
        fuelCapacity: 3000 + Math.random() * 4000, // 3000-7000 tons
        cargoCapacity: 500 + Math.random() * 1500, // 500-2000 tons
        currentCargoWeight: Math.random() * 1500 // 0-1500 tons
      };

      // Generate random weather conditions
      const weatherConditions = {
        windSpeed: Math.random() * 50, // 0-50 knots
        waveHeight: Math.random() * 10, // 0-10 meters
        visibility: Math.random() * 10, // 0-10 nautical miles
        temperature: Math.random() * 40 - 10 // -10 to 30 degrees Celsius
      };

      // Generate random preferences
      const preferences = {
        prioritizeFuel: Math.random() > 0.5,
        prioritizeTime: Math.random() > 0.5,
        avoidRoughSeas: Math.random() > 0.5
      };

      // Calculate distance
      const distance = this.calculateDistance(origin, destination);

      // Create input vector
      const input = [
        origin.latitude, origin.longitude,
        destination.latitude, destination.longitude,
        shipSpecs.maxSpeed,
        shipSpecs.currentCargoWeight / shipSpecs.cargoCapacity,
        weatherConditions.windSpeed / 50,
        weatherConditions.waveHeight / 10,
        weatherConditions.visibility / 10,
        weatherConditions.temperature / 40,
        preferences.prioritizeFuel ? 1 : 0,
        preferences.prioritizeTime ? 1 : 0,
        preferences.avoidRoughSeas ? 1 : 0,
        distance / 10000, // Normalize distance
        shipSpecs.fuelCapacity / 7000
      ];

      // Generate synthetic output based on input factors
      const timeFactor = this.calculateTimeFactor(input);
      const fuelFactor = this.calculateFuelFactor(input);
      const riskScore = this.calculateRiskScore(input);
      const routeEfficiency = this.calculateRouteEfficiency(input);

      inputs.push(input);
      outputs.push([timeFactor, fuelFactor, riskScore, routeEfficiency]);
    }

    return {
      inputs,
      outputs,
      validationSplit: 0.2
    };
  }

  private calculateTimeFactor(input: number[]): number {
    // Time factor calculation based on various inputs
    const speedFactor = input[4] / 35; // max speed factor
    const weatherImpact = (input[6] + input[7]) / 2; // wind and wave impact
    const prioritizeTime = input[11];
    
    let factor = (speedFactor * 0.4 + (1 - weatherImpact) * 0.4 + prioritizeTime * 0.2);
    return Math.max(0, Math.min(1, factor));
  }

  private calculateFuelFactor(input: number[]): number {
    // Fuel factor calculation
    const cargoLoad = input[5];
    const weatherImpact = (input[6] + input[7]) / 2;
    const prioritizeFuel = input[10];
    
    let factor = ((1 - cargoLoad) * 0.3 + (1 - weatherImpact) * 0.4 + prioritizeFuel * 0.3);
    return Math.max(0, Math.min(1, factor));
  }

  private calculateRiskScore(input: number[]): number {
    // Risk score calculation
    const weatherRisk = (input[6] + input[7]) / 2;
    const visibilityRisk = 1 - input[8];
    const avoidRoughSeas = input[12];
    
    let score = (weatherRisk * 0.4 + visibilityRisk * 0.3 + (1 - avoidRoughSeas) * 0.3);
    return Math.max(0, Math.min(1, score));
  }

  private calculateRouteEfficiency(input: number[]): number {
    // Route efficiency calculation
    const timeFactor = this.calculateTimeFactor(input);
    const fuelFactor = this.calculateFuelFactor(input);
    const riskScore = this.calculateRiskScore(input);
    
    let efficiency = (timeFactor * 0.35 + fuelFactor * 0.35 + (1 - riskScore) * 0.3);
    return Math.max(0, Math.min(1, efficiency));
  }
} 