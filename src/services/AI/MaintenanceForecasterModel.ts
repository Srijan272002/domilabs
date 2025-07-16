import * as tf from '@tensorflow/tfjs-node';
import { BaseModel, ModelConfig, TrainingData } from './BaseModel';
import { logger } from '../../utils/logger';

export interface MaintenanceInput {
  ship: {
    id: string;
    type: 'cargo' | 'tanker' | 'container' | 'bulk' | 'passenger';
    age: number; // years
    length: number; // meters
    enginePower: number; // kW
    hoursOperated: number; // total operating hours
  };
  component: {
    type: 'engine' | 'propeller' | 'hull' | 'navigation' | 'electrical' | 'hydraulic' | 'hvac';
    lastMaintenanceDate: Date;
    maintenanceHistory: Array<{
      date: Date;
      type: 'preventive' | 'corrective' | 'emergency';
      cost: number;
      downtime: number; // hours
      description: string;
    }>;
    operatingConditions: {
      averageLoad: number; // 0-1
      temperature: number; // Celsius
      vibration: number; // 0-10 scale
      pressure: number; // bar
    };
  };
  usage: {
    dailyOperatingHours: number;
    voyagesPerMonth: number;
    averageVoyageDistance: number; // nautical miles
    environmentalConditions: {
      saltWaterExposure: number; // 0-1 scale
      temperatureVariation: number; // Celsius range
      roughSeaExposure: number; // 0-1 scale
    };
  };
  sensors: {
    temperature: number[];
    vibration: number[];
    pressure: number[];
    efficiency: number[];
    lastReadings: {
      temperature: number;
      vibration: number;
      pressure: number;
      efficiency: number;
    };
  };
}

export interface MaintenancePrediction {
  riskScore: number; // 0-1 scale (1 = immediate attention needed)
  predictedFailureDate: Date | null;
  recommendedMaintenanceDate: Date;
  maintenanceType: 'preventive' | 'corrective' | 'emergency';
  estimatedCost: number;
  estimatedDowntime: number; // hours
  confidence: number; // 0-1
  factors: {
    ageScore: number;
    usageScore: number;
    conditionScore: number;
    historyScore: number;
    sensorScore: number;
  };
  recommendations: string[];
  alternativeSchedules?: Array<{
    date: Date;
    type: string;
    cost: number;
    risk: number;
  }>;
}

export interface ComponentHealth {
  overall: number; // 0-1 scale
  trend: 'improving' | 'stable' | 'degrading';
  criticalIssues: string[];
  upcomingMaintenance: Array<{
    component: string;
    date: Date;
    priority: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

export class MaintenanceForecasterModel extends BaseModel {
  private static readonly COMPONENT_WEIGHTS = {
    engine: 0.4,
    propeller: 0.2,
    hull: 0.15,
    navigation: 0.1,
    electrical: 0.08,
    hydraulic: 0.05,
    hvac: 0.02
  };

  constructor() {
    const config: ModelConfig = {
      modelName: 'maintenance-forecaster',
      version: '1.0.0',
      inputShape: [25], // Comprehensive maintenance features
      outputShape: [5], // risk_score, days_to_failure, cost_factor, downtime_factor, maintenance_urgency
      learningRate: 0.0008,
      epochs: 250,
      batchSize: 48
    };
    super(config);
  }

  buildModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [25],
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
        tf.layers.dropout({ rate: 0.25 }),
        tf.layers.dense({
          units: 32,
          activation: 'relu'
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 16,
          activation: 'relu'
        }),
        tf.layers.dense({
          units: 5,
          activation: 'sigmoid' // Output between 0 and 1
        })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(this.config.learningRate || 0.0008),
      loss: 'meanSquaredError',
      metrics: ['mae', 'mse']
    });

    return model;
  }

  preprocessInput(data: MaintenanceInput): number[] {
    // Validate input structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid input: data must be an object');
    }

    const { ship, component, usage, sensors } = data;

    // Validate required objects
    if (!ship || typeof ship !== 'object') {
      throw new Error('Invalid input: ship data is required');
    }
    if (!component || typeof component !== 'object') {
      throw new Error('Invalid input: component data is required');
    }
    if (!usage || typeof usage !== 'object') {
      throw new Error('Invalid input: usage data is required');
    }
    if (!sensors || typeof sensors !== 'object') {
      throw new Error('Invalid input: sensors data is required');
    }

    // Validate arrays
    if (!Array.isArray(component.maintenanceHistory)) {
      component.maintenanceHistory = [];
      logger.warn('Maintenance history not provided, using empty array', {
        shipId: ship.id,
        componentType: component.type
      });
    }

    if (!Array.isArray(sensors.temperature)) {
      sensors.temperature = [];
      logger.warn('Temperature sensor data not provided, using empty array');
    }
    if (!Array.isArray(sensors.vibration)) {
      sensors.vibration = [];
      logger.warn('Vibration sensor data not provided, using empty array');
    }
    if (!Array.isArray(sensors.pressure)) {
      sensors.pressure = [];
      logger.warn('Pressure sensor data not provided, using empty array');
    }
    if (!Array.isArray(sensors.efficiency)) {
      sensors.efficiency = [];
      logger.warn('Efficiency sensor data not provided, using empty array');
    }

    // Validate sensor readings
    if (!sensors.lastReadings || typeof sensors.lastReadings !== 'object') {
      sensors.lastReadings = {
        temperature: 0,
        vibration: 0,
        pressure: 0,
        efficiency: 1
      };
      logger.warn('Last sensor readings not provided, using default values');
    }

    // Validate dates
    const validateDate = (date: Date | undefined): Date => {
      if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return new Date(); // Default to current date if invalid
      }
      return date;
    };

    const lastMaintenanceDate = validateDate(component.lastMaintenanceDate);
    const validatedHistory = component.maintenanceHistory.map(h => ({
      ...h,
      date: validateDate(h.date)
    }));

    // Calculate derived features
    const daysSinceLastMaintenance = Math.floor(
      (Date.now() - lastMaintenanceDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const averageMaintenanceInterval = this.calculateAverageMaintenanceInterval(
      validatedHistory
    );

    const sensorTrends = this.calculateSensorTrends(sensors);

    // Normalize features
    const features = [
      ship.age / 50,                           // Max 50 years
      ship.length / 400,                       // Max 400m
      ship.enginePower / 50000,                // Max 50,000 kW
      ship.hoursOperated / 100000,             // Max 100,000 hours
      this.encodeShipType(ship.type),          // Ship type encoding
      this.encodeComponentType(component.type), // Component type encoding
      daysSinceLastMaintenance / 365,          // Normalized to years
      component.maintenanceHistory.length / 50, // Max 50 maintenance events
      this.calculateMaintenanceCostTrend(component.maintenanceHistory),
      component.operatingConditions.averageLoad, // Already 0-1
      component.operatingConditions.temperature / 100, // Max 100°C
      component.operatingConditions.vibration / 10,    // 0-10 scale
      component.operatingConditions.pressure / 50,     // Max 50 bar
      usage.dailyOperatingHours / 24,          // Max 24 hours
      usage.voyagesPerMonth / 30,              // Max 30 voyages
      usage.averageVoyageDistance / 10000,     // Max 10,000 nm
      usage.environmentalConditions.saltWaterExposure, // Already 0-1
      usage.environmentalConditions.temperatureVariation / 50, // Max 50°C variation
      usage.environmentalConditions.roughSeaExposure,  // Already 0-1
      sensors.lastReadings.temperature / 100,  // Max 100°C
      sensors.lastReadings.vibration / 10,     // 0-10 scale
      sensors.lastReadings.pressure / 50,      // Max 50 bar
      sensors.lastReadings.efficiency,         // Already 0-1
      sensorTrends.temperature,                // -1 to 1 (deteriorating to improving)
      sensorTrends.vibration                   // -1 to 1
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

  private encodeComponentType(type: string): number {
    const typeMap: { [key: string]: number } = {
      'engine': 1.0,
      'propeller': 0.8,
      'hull': 0.6,
      'navigation': 0.4,
      'electrical': 0.3,
      'hydraulic': 0.2,
      'hvac': 0.1
    };
    return typeMap[type] || 0.5;
  }

  private calculateAverageMaintenanceInterval(history: any[]): number {
    if (history.length < 2) return 365; // Default to 1 year

    const intervals = [];
    for (let i = 1; i < history.length; i++) {
      const interval = Math.floor(
        (history[i].date.getTime() - history[i - 1].date.getTime()) / (1000 * 60 * 60 * 24)
      );
      intervals.push(interval);
    }

    return intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  }

  private calculateMaintenanceCostTrend(history: any[]): number {
    if (history.length < 3) return 0;

    const recentCosts = history.slice(-3).map(h => h.cost);
    const earlierCosts = history.slice(0, 3).map(h => h.cost);

    const recentAvg = recentCosts.reduce((sum, cost) => sum + cost, 0) / recentCosts.length;
    const earlierAvg = earlierCosts.reduce((sum, cost) => sum + cost, 0) / earlierCosts.length;

    return Math.min(1, Math.max(-1, (recentAvg - earlierAvg) / earlierAvg));
  }

  private calculateSensorTrends(sensors: any): { temperature: number; vibration: number } {
    const calculateTrend = (values: number[]): number => {
      if (!Array.isArray(values)) {
        logger.warn('Invalid sensor values array, using default trend');
        return 0;
      }

      // Filter out invalid values
      const validValues = values.filter(v => typeof v === 'number' && !isNaN(v));
      if (validValues.length < 3) {
        logger.warn('Insufficient valid sensor values for trend calculation');
        return 0;
      }
      
      const recent = validValues.slice(-5);
      const earlier = validValues.slice(0, 5);
      
      if (recent.length === 0 || earlier.length === 0) {
        logger.warn('Insufficient sensor data for trend calculation');
        return 0;
      }
      
      const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
      const earlierAvg = earlier.reduce((sum, val) => sum + val, 0) / earlier.length;
      
      if (earlierAvg === 0) {
        logger.warn('Invalid earlier average (zero), cannot calculate trend');
        return 0;
      }
      
      return Math.min(1, Math.max(-1, (recentAvg - earlierAvg) / earlierAvg));
    };

    // Ensure sensors object has required arrays
    const validSensors = {
      temperature: Array.isArray(sensors?.temperature) ? sensors.temperature : [],
      vibration: Array.isArray(sensors?.vibration) ? sensors.vibration : []
    };

    return {
      temperature: calculateTrend(validSensors.temperature),
      vibration: calculateTrend(validSensors.vibration)
    };
  }

  postprocessOutput(prediction: tf.Tensor): number[] {
    const values = prediction.dataSync();
    return Array.from(values);
  }

  async predictMaintenance(input: MaintenanceInput): Promise<MaintenancePrediction> {
    try {
      // Validate input before prediction
      if (!input || typeof input !== 'object') {
        throw new Error('Invalid input: maintenance input data is required');
      }

      // Ensure model is loaded
      if (!this.model || !this.isLoaded) {
        await this.initialize();
      }

      const prediction = await this.predict(input);
      if (!prediction || !Array.isArray(prediction.prediction) || prediction.prediction.length !== 5) {
        throw new Error('Invalid prediction result');
      }

      const [riskScore, daysToFailureFactor, costFactor, downtimeFactor, urgencyFactor] = prediction.prediction;

      // Validate prediction values
      if (isNaN(riskScore) || isNaN(daysToFailureFactor) || isNaN(costFactor) || isNaN(downtimeFactor) || isNaN(urgencyFactor)) {
        throw new Error('Invalid prediction values');
      }

      // Calculate derived predictions with validation
      const daysSinceLastMaintenance = Math.floor(
        (Date.now() - (input.component.lastMaintenanceDate?.getTime() || Date.now())) / (1000 * 60 * 60 * 24)
      );

      const averageInterval = this.calculateAverageMaintenanceInterval(
        Array.isArray(input.component.maintenanceHistory) ? input.component.maintenanceHistory : []
      );
      const baseDaysToFailure = averageInterval * 1.2; // Add 20% buffer

      const predictedDaysToFailure = Math.max(1, baseDaysToFailure * (1 - daysToFailureFactor));
      const predictedFailureDate = riskScore > 0.8 ? 
        new Date(Date.now() + predictedDaysToFailure * 24 * 60 * 60 * 1000) : null;

      // Recommend maintenance before predicted failure
      const recommendedMaintenanceDate = new Date(
        Date.now() + Math.max(7, predictedDaysToFailure * 0.7) * 24 * 60 * 60 * 1000
      );

      // Determine maintenance type based on risk and urgency
      let maintenanceType: 'preventive' | 'corrective' | 'emergency';
      if (riskScore > 0.9 || urgencyFactor > 0.9) {
        maintenanceType = 'emergency';
      } else if (riskScore > 0.6) {
        maintenanceType = 'corrective';
      } else {
        maintenanceType = 'preventive';
      }

      // Calculate costs and downtime
      const baseCost = this.calculateBaseCost(input.component.type, maintenanceType);
      const estimatedCost = baseCost * (1 + costFactor * 0.5);

      const baseDowntime = this.calculateBaseDowntime(input.component.type, maintenanceType);
      const estimatedDowntime = baseDowntime * (1 + downtimeFactor * 0.4);

      // Calculate factor scores
      const factors = this.calculateFactorScores(input);

      // Generate recommendations
      const recommendations = this.generateRecommendations(input, riskScore, maintenanceType);

      // Generate alternative schedules
      const alternativeSchedules = this.generateAlternativeSchedules(
        recommendedMaintenanceDate,
        estimatedCost,
        riskScore
      );

      logger.info('Maintenance prediction completed', {
        component: input.component.type,
        riskScore,
        maintenanceType,
        estimatedCost,
        confidence: prediction.confidence
      });

      return {
        riskScore,
        predictedFailureDate,
        recommendedMaintenanceDate,
        maintenanceType,
        estimatedCost,
        estimatedDowntime,
        confidence: prediction.confidence,
        factors,
        recommendations,
        alternativeSchedules
      };
    } catch (error) {
      logger.error('Maintenance prediction failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private calculateBaseCost(componentType: string, maintenanceType: string): number {
    const baseCosts = {
      engine: { preventive: 5000, corrective: 15000, emergency: 35000 },
      propeller: { preventive: 2000, corrective: 8000, emergency: 20000 },
      hull: { preventive: 3000, corrective: 12000, emergency: 30000 },
      navigation: { preventive: 1500, corrective: 5000, emergency: 12000 },
      electrical: { preventive: 1000, corrective: 4000, emergency: 10000 },
      hydraulic: { preventive: 1200, corrective: 4500, emergency: 11000 },
      hvac: { preventive: 800, corrective: 2500, emergency: 6000 }
    };

    return baseCosts[componentType as keyof typeof baseCosts]?.[maintenanceType as keyof typeof baseCosts.engine] || 1000;
  }

  private calculateBaseDowntime(componentType: string, maintenanceType: string): number {
    const baseDowntimes = {
      engine: { preventive: 8, corrective: 24, emergency: 72 },
      propeller: { preventive: 12, corrective: 36, emergency: 96 },
      hull: { preventive: 24, corrective: 72, emergency: 168 },
      navigation: { preventive: 4, corrective: 12, emergency: 24 },
      electrical: { preventive: 6, corrective: 18, emergency: 48 },
      hydraulic: { preventive: 8, corrective: 20, emergency: 56 },
      hvac: { preventive: 4, corrective: 10, emergency: 24 }
    };

    return baseDowntimes[componentType as keyof typeof baseDowntimes]?.[maintenanceType as keyof typeof baseDowntimes.engine] || 8;
  }

  private calculateFactorScores(input: MaintenanceInput): {
    ageScore: number;
    usageScore: number;
    conditionScore: number;
    historyScore: number;
    sensorScore: number;
  } {
    const ageScore = Math.min(1, input.ship.age / 25); // Max age factor at 25 years
    
    const usageScore = Math.min(1, 
      (input.usage.dailyOperatingHours / 16) * 0.5 +
      (input.usage.voyagesPerMonth / 20) * 0.3 +
      (input.usage.environmentalConditions.roughSeaExposure) * 0.2
    );

    const conditionScore = Math.min(1,
      (input.component.operatingConditions.averageLoad) * 0.4 +
      (input.component.operatingConditions.vibration / 10) * 0.3 +
      (input.component.operatingConditions.temperature / 100) * 0.3
    );

    const historyScore = Math.min(1, input.component.maintenanceHistory.length / 20);

    const sensorScore = Math.min(1,
      (1 - input.sensors.lastReadings.efficiency) * 0.5 +
      (input.sensors.lastReadings.vibration / 10) * 0.3 +
      (input.sensors.lastReadings.temperature / 100) * 0.2
    );

    return { ageScore, usageScore, conditionScore, historyScore, sensorScore };
  }

  private generateRecommendations(
    input: MaintenanceInput,
    riskScore: number,
    maintenanceType: string
  ): string[] {
    const recommendations = [];

    if (riskScore > 0.8) {
      recommendations.push('Schedule immediate inspection');
      recommendations.push('Consider reducing operational load');
    }

    if (maintenanceType === 'emergency') {
      recommendations.push('Prioritize emergency maintenance scheduling');
      recommendations.push('Prepare backup systems if available');
    }

    if (input.sensors.lastReadings.efficiency < 0.7) {
      recommendations.push('Component efficiency is below optimal - consider replacement');
    }

    if (input.component.operatingConditions.vibration > 7) {
      recommendations.push('High vibration detected - check alignment and mounting');
    }

    const daysSinceMaintenance = Math.floor(
      (Date.now() - input.component.lastMaintenanceDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceMaintenance > 365) {
      recommendations.push('Component overdue for scheduled maintenance');
    }

    return recommendations;
  }

  private generateAlternativeSchedules(
    recommendedDate: Date,
    baseCost: number,
    riskScore: number
  ): Array<{ date: Date; type: string; cost: number; risk: number }> {
    const alternatives = [];

    // Earlier maintenance option
    const earlierDate = new Date(recommendedDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    alternatives.push({
      date: earlierDate,
      type: 'Preventive (Early)',
      cost: baseCost * 0.9,
      risk: riskScore * 0.8
    });

    // Later maintenance option (if risk allows)
    if (riskScore < 0.7) {
      const laterDate = new Date(recommendedDate.getTime() + 14 * 24 * 60 * 60 * 1000);
      alternatives.push({
        date: laterDate,
        type: 'Preventive (Delayed)',
        cost: baseCost * 1.1,
        risk: riskScore * 1.2
      });
    }

    return alternatives;
  }

  async analyzeFleetHealth(inputs: MaintenanceInput[]): Promise<ComponentHealth> {
    const predictions = [];
    const criticalIssues = [];
    const upcomingMaintenance = [];

    for (const input of inputs) {
      try {
        const prediction = await this.predictMaintenance(input);
        predictions.push(prediction);

        if (prediction.riskScore > 0.8) {
          criticalIssues.push(`${input.component.type} on ship ${input.ship.id} requires immediate attention`);
        }

        if (prediction.riskScore > 0.5) {
          upcomingMaintenance.push({
            component: `${input.ship.id}-${input.component.type}`,
            date: prediction.recommendedMaintenanceDate,
            priority: prediction.riskScore > 0.8 ? 'critical' as const :
                     prediction.riskScore > 0.6 ? 'high' as const :
                     prediction.riskScore > 0.4 ? 'medium' as const : 'low' as const
          });
        }
      } catch (error) {
        logger.warn('Failed to analyze component health', { 
          shipId: input.ship.id,
          component: input.component.type,
          error 
        });
      }
    }

    const overallHealth = predictions.length > 0 ? 
      predictions.reduce((sum, p) => sum + (1 - p.riskScore), 0) / predictions.length : 1;

    // Determine trend based on recent maintenance patterns
    const recentRiskScores = predictions.map(p => p.riskScore);
    const avgRisk = recentRiskScores.reduce((sum, risk) => sum + risk, 0) / recentRiskScores.length;
    
    let trend: 'improving' | 'stable' | 'degrading';
    if (avgRisk > 0.6) trend = 'degrading';
    else if (avgRisk < 0.3) trend = 'improving';
    else trend = 'stable';

    return {
      overall: overallHealth,
      trend,
      criticalIssues,
      upcomingMaintenance: upcomingMaintenance.sort((a, b) => a.date.getTime() - b.date.getTime())
    };
  }

  async generateTrainingData(sampleSize: number): Promise<TrainingData> {
    const inputs: number[][] = [];
    const outputs: number[][] = [];

    for (let i = 0; i < sampleSize; i++) {
      // Generate random ship data
      const ship = {
        age: 1 + Math.random() * 24, // 1-25 years
        hoursOperated: 1000 + Math.random() * 99000, // 1000-100000 hours
        enginePower: 15000 + Math.random() * 20000, // 15000-35000 kW
        length: 200 + Math.random() * 200 // 200-400 meters
      };

      // Generate random component data
      const component = {
        type: Math.random() > 0.5 ? "engine" : "propeller",
        age: Math.random() * ship.age, // 0-ship age years
        lastMaintenanceAge: Math.random() * ship.age * 0.8, // Last maintenance before current age
        maintenanceCount: Math.floor(Math.random() * 10), // 0-10 maintenance events
        failureCount: Math.floor(Math.random() * 3), // 0-2 failures
        operatingHours: Math.random() * ship.hoursOperated
      };

      // Generate random operating conditions
      const conditions = {
        averageLoad: 0.4 + Math.random() * 0.5, // 40-90% load
        temperature: 40 + Math.random() * 40, // 40-80 degrees Celsius
        vibration: 1 + Math.random() * 4, // 1-5 mm/s
        pressure: 20 + Math.random() * 10, // 20-30 bar
        oilQuality: Math.random(), // 0-1 scale
        coolingEfficiency: 0.7 + Math.random() * 0.3 // 70-100%
      };

      // Generate random usage patterns
      const usage = {
        dailyOperatingHours: 8 + Math.random() * 16, // 8-24 hours
        startStopCycles: Math.floor(Math.random() * 1000), // 0-1000 cycles
        overloadFrequency: Math.random() * 0.2, // 0-20% of time
        environmentalStress: Math.random() // 0-1 scale
      };

      // Generate sensor data trends
      const sensors = {
        temperatureSlope: -0.1 + Math.random() * 0.2, // -0.1 to 0.1 degree/hour
        vibrationSlope: Math.random() * 0.01, // 0-0.01 mm/s/hour
        pressureSlope: -0.01 + Math.random() * 0.02, // -0.01 to 0.01 bar/hour
        efficiencySlope: -0.001 + Math.random() * 0.002 // -0.001 to 0.001 per hour
      };

      // Create normalized input vector
      const input = [
        ship.age / 25,
        ship.hoursOperated / 100000,
        ship.enginePower / 35000,
        ship.length / 400,
        component.age / ship.age,
        component.lastMaintenanceAge / ship.age,
        component.maintenanceCount / 10,
        component.failureCount / 3,
        component.operatingHours / ship.hoursOperated,
        conditions.averageLoad,
        conditions.temperature / 80,
        conditions.vibration / 5,
        conditions.pressure / 30,
        conditions.oilQuality,
        conditions.coolingEfficiency,
        usage.dailyOperatingHours / 24,
        usage.startStopCycles / 1000,
        usage.overloadFrequency,
        usage.environmentalStress,
        sensors.temperatureSlope + 0.1, // Normalize to 0-1
        sensors.vibrationSlope / 0.01,
        sensors.pressureSlope + 0.01, // Normalize to 0-1
        sensors.efficiencySlope + 0.001, // Normalize to 0-1
        component.type === "engine" ? 1 : 0,
        Math.random() // Random noise factor
      ];

      // Calculate synthetic maintenance prediction outputs
      const riskScore = this.calculateRiskScore(input);
      const daysToFailure = this.calculateDaysToFailure(input);
      const costFactor = this.calculateCostFactor(input);
      const downtimeFactor = this.calculateDowntimeFactor(input);
      const maintenanceUrgency = this.calculateMaintenanceUrgency(input);

      inputs.push(input);
      outputs.push([riskScore, daysToFailure, costFactor, downtimeFactor, maintenanceUrgency]);
    }

    return {
      inputs,
      outputs,
      validationSplit: 0.2
    };
  }

  private calculateRiskScore(input: number[]): number {
    // Risk score based on multiple factors
    const ageRisk = input[0] * 0.15;
    const usageRisk = input[1] * 0.15;
    const maintenanceHistory = (input[6] / 10) * 0.1;
    const failureHistory = input[7] * 0.15;
    const conditionRisk = (input[9] + input[11] + input[13]) / 3 * 0.2;
    const sensorTrends = (input[20] + input[21] + input[22]) / 3 * 0.25;

    let risk = ageRisk + usageRisk + maintenanceHistory + failureHistory + conditionRisk + sensorTrends;
    return Math.max(0, Math.min(1, risk));
  }

  private calculateDaysToFailure(input: number[]): number {
    // Normalized days to failure (0 = immediate, 1 = far future)
    const baseLife = 1 - input[0]; // Newer equipment lasts longer
    const maintenanceEffect = input[5] * 0.2; // Recent maintenance helps
    const conditionEffect = (input[10] + input[11] + input[12]) / 3 * 0.3;
    const trendEffect = (1 - (input[20] + input[21] + input[22]) / 3) * 0.3;

    let daysToFailure = baseLife + maintenanceEffect + conditionEffect + trendEffect;
    return Math.max(0, Math.min(1, daysToFailure));
  }

  private calculateCostFactor(input: number[]): number {
    // Cost factor (0 = low cost, 1 = high cost)
    const componentFactor = input[23] * 0.3; // Engine more expensive than propeller
    const ageFactor = input[0] * 0.2;
    const conditionFactor = (input[10] + input[11] + input[12]) / 3 * 0.3;
    const urgencyFactor = this.calculateMaintenanceUrgency(input) * 0.2;

    let cost = componentFactor + ageFactor + conditionFactor + urgencyFactor;
    return Math.max(0, Math.min(1, cost));
  }

  private calculateDowntimeFactor(input: number[]): number {
    // Downtime factor (0 = short downtime, 1 = long downtime)
    const componentFactor = input[23] * 0.25;
    const complexityFactor = (input[2] + input[3]) / 2 * 0.25;
    const accessFactor = input[18] * 0.25;
    const urgencyFactor = this.calculateMaintenanceUrgency(input) * 0.25;

    let downtime = componentFactor + complexityFactor + accessFactor + urgencyFactor;
    return Math.max(0, Math.min(1, downtime));
  }

  private calculateMaintenanceUrgency(input: number[]): number {
    // Maintenance urgency (0 = not urgent, 1 = very urgent)
    const riskScore = this.calculateRiskScore(input);
    const operationalImpact = input[9] * 0.3;
    const sensorWarnings = (input[20] + input[21] + input[22]) / 3 * 0.3;
    const timeSinceLastMaintenance = (1 - input[5]) * 0.2;

    let urgency = riskScore * 0.2 + operationalImpact + sensorWarnings + timeSinceLastMaintenance;
    return Math.max(0, Math.min(1, urgency));
  }
} 