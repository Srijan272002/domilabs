import { RouteOptimizerModel, RouteInput, RouteOptimization } from './RouteOptimizerModel';
import { FuelPredictorModel, FuelPredictionInput, FuelPrediction } from './FuelPredictorModel';
import { MaintenanceForecasterModel, MaintenanceInput, MaintenancePrediction, ComponentHealth } from './MaintenanceForecasterModel';
import { BaseModel } from './BaseModel';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface AIServiceConfig {
  autoTrainModels: boolean;
  modelUpdateInterval: number; // hours
  performanceThreshold: number; // 0-1 scale
  enableModelVersioning: boolean;
  maxModelVersions: number;
}

export interface ModelPerformanceMetrics {
  modelName: string;
  version: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  lastEvaluated: Date;
  predictionCount: number;
  averageConfidence: number;
}

export interface AIServiceStatus {
  isReady: boolean;
  modelsLoaded: {
    routeOptimizer: boolean;
    fuelPredictor: boolean;
    maintenanceForecaster: boolean;
  };
  lastTrainingDate: Date | null;
  performanceMetrics: ModelPerformanceMetrics[];
  systemHealth: 'excellent' | 'good' | 'fair' | 'poor';
}

export class AIService {
  private routeOptimizer: RouteOptimizerModel;
  private fuelPredictor: FuelPredictorModel;
  private maintenanceForecaster: MaintenanceForecasterModel;
  private config: AIServiceConfig;
  private performanceMetrics: Map<string, ModelPerformanceMetrics> = new Map();
  private predictionHistory: Array<{
    modelName: string;
    timestamp: Date;
    confidence: number;
    success: boolean;
  }> = [];

  constructor(config?: Partial<AIServiceConfig>) {
    this.config = {
      autoTrainModels: true,
      modelUpdateInterval: 24, // 24 hours
      performanceThreshold: 0.8,
      enableModelVersioning: true,
      maxModelVersions: 5,
      ...config
    };

    this.routeOptimizer = new RouteOptimizerModel();
    this.fuelPredictor = new FuelPredictorModel();
    this.maintenanceForecaster = new MaintenanceForecasterModel();
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing AI Service', { config: this.config });

      // Initialize all models
      await Promise.all([
        this.routeOptimizer.initialize(),
        this.fuelPredictor.initialize(),
        this.maintenanceForecaster.initialize()
      ]);

      // Load performance metrics
      await this.loadPerformanceMetrics();

      // Check if models need training
      if (this.config.autoTrainModels) {
        await this.checkAndTrainModels();
      }

      logger.info('AI Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AI Service', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async optimizeRoute(input: RouteInput): Promise<RouteOptimization> {
    try {
      const startTime = Date.now();
      const optimization = await this.routeOptimizer.optimizeRoute(input);
      const duration = Date.now() - startTime;

      // Record prediction
      this.recordPrediction('route-optimizer', optimization.weatherRiskScore, true);

      logger.info('Route optimization completed', {
        duration,
        totalDistance: optimization.totalDistance,
        estimatedTime: optimization.estimatedTime,
        fuelConsumption: optimization.estimatedFuelConsumption
      });

      return optimization;
    } catch (error) {
      this.recordPrediction('route-optimizer', 0, false);
      logger.error('Route optimization failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async predictFuelConsumption(input: FuelPredictionInput): Promise<FuelPrediction> {
    try {
      const startTime = Date.now();
      const prediction = await this.fuelPredictor.predictFuelConsumption(input);
      const duration = Date.now() - startTime;

      // Record prediction
      this.recordPrediction('fuel-predictor', prediction.confidence, true);

      logger.info('Fuel consumption predicted', {
        duration,
        totalConsumption: prediction.totalConsumption,
        efficiency: prediction.efficiency,
        confidence: prediction.confidence
      });

      return prediction;
    } catch (error) {
      this.recordPrediction('fuel-predictor', 0, false);
      logger.error('Fuel prediction failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async predictMaintenance(input: MaintenanceInput): Promise<MaintenancePrediction> {
    try {
      const startTime = Date.now();
      const prediction = await this.maintenanceForecaster.predictMaintenance(input);
      const duration = Date.now() - startTime;

      // Record prediction
      this.recordPrediction('maintenance-forecaster', prediction.confidence, true);

      logger.info('Maintenance prediction completed', {
        duration,
        riskScore: prediction.riskScore,
        maintenanceType: prediction.maintenanceType,
        confidence: prediction.confidence
      });

      return prediction;
    } catch (error) {
      this.recordPrediction('maintenance-forecaster', 0, false);
      logger.error('Maintenance prediction failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async analyzeFleetHealth(maintenanceInputs: MaintenanceInput[]): Promise<ComponentHealth> {
    try {
      const health = await this.maintenanceForecaster.analyzeFleetHealth(maintenanceInputs);
      
      logger.info('Fleet health analysis completed', {
        overallHealth: health.overall,
        trend: health.trend,
        criticalIssues: health.criticalIssues.length,
        upcomingMaintenance: health.upcomingMaintenance.length
      });

      return health;
    } catch (error) {
      logger.error('Fleet health analysis failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async trainAllModels(): Promise<void> {
    try {
      logger.info('Starting comprehensive model training');

      // Generate training data for all models
      const [routeData, fuelData, maintenanceData] = await Promise.all([
        this.routeOptimizer.generateTrainingData(1000),
        this.fuelPredictor.generateTrainingData(2000),
        this.maintenanceForecaster.generateTrainingData(1500)
      ]);

      // Train all models
      const trainingPromises = [
        this.routeOptimizer.train(routeData),
        this.fuelPredictor.train(fuelData),
        this.maintenanceForecaster.train(maintenanceData)
      ];

      const results = await Promise.all(trainingPromises);

      // Update performance metrics
      await this.updatePerformanceMetrics();

      logger.info('All models trained successfully', {
        routeLoss: results[0].history.loss[results[0].history.loss.length - 1],
        fuelLoss: results[1].history.loss[results[1].history.loss.length - 1],
        maintenanceLoss: results[2].history.loss[results[2].history.loss.length - 1]
      });
    } catch (error) {
      logger.error('Model training failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getServiceStatus(): Promise<AIServiceStatus> {
    const routeInfo = this.routeOptimizer.getModelInfo();
    const fuelInfo = this.fuelPredictor.getModelInfo();
    const maintenanceInfo = this.maintenanceForecaster.getModelInfo();

    const performanceMetrics = Array.from(this.performanceMetrics.values());
    const avgPerformance = performanceMetrics.length > 0 
      ? performanceMetrics.reduce((sum, metrics) => sum + metrics.accuracy, 0) / performanceMetrics.length
      : 0;

    let systemHealth: 'excellent' | 'good' | 'fair' | 'poor';
    if (avgPerformance > 0.9) systemHealth = 'excellent';
    else if (avgPerformance > 0.8) systemHealth = 'good';
    else if (avgPerformance > 0.6) systemHealth = 'fair';
    else systemHealth = 'poor';

    return {
      isReady: routeInfo.isLoaded && fuelInfo.isLoaded && maintenanceInfo.isLoaded,
      modelsLoaded: {
        routeOptimizer: routeInfo.isLoaded,
        fuelPredictor: fuelInfo.isLoaded,
        maintenanceForecaster: maintenanceInfo.isLoaded
      },
      lastTrainingDate: this.getLastTrainingDate(),
      performanceMetrics,
      systemHealth
    };
  }

  async evaluateModels(): Promise<{ [modelName: string]: number }> {
    const evaluations: { [modelName: string]: number } = {};

    try {
      // Simple evaluation based on recent prediction success rate
      const recentPredictions = this.predictionHistory.slice(-100);
      
      for (const modelName of ['route-optimizer', 'fuel-predictor', 'maintenance-forecaster']) {
        const modelPredictions = recentPredictions.filter(p => p.modelName === modelName);
        if (modelPredictions.length > 0) {
          const successRate = modelPredictions.filter(p => p.success).length / modelPredictions.length;
          const avgConfidence = modelPredictions.reduce((sum, p) => sum + p.confidence, 0) / modelPredictions.length;
          evaluations[modelName] = (successRate * 0.7 + avgConfidence * 0.3);
        } else {
          evaluations[modelName] = 0.5; // Default score
        }
      }

      logger.info('Model evaluation completed', evaluations);
    } catch (error) {
      logger.error('Model evaluation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return evaluations;
  }

  private async checkAndTrainModels(): Promise<void> {
    const evaluations = await this.evaluateModels();
    const needsTraining = Object.entries(evaluations).some(
      ([, score]) => score < this.config.performanceThreshold
    );

    if (needsTraining) {
      logger.info('Models below performance threshold, initiating training');
      await this.trainAllModels();
    }
  }

  private recordPrediction(modelName: string, confidence: number, success: boolean): void {
    this.predictionHistory.push({
      modelName,
      timestamp: new Date(),
      confidence,
      success
    });

    // Keep only recent predictions (last 1000)
    if (this.predictionHistory.length > 1000) {
      this.predictionHistory = this.predictionHistory.slice(-1000);
    }
  }

  private async loadPerformanceMetrics(): Promise<void> {
    try {
      const metricsPath = path.join(process.cwd(), 'models', 'performance-metrics.json');
      if (fs.existsSync(metricsPath)) {
        const data = fs.readFileSync(metricsPath, 'utf8');
        const metrics = JSON.parse(data);
        
        for (const metric of metrics) {
          this.performanceMetrics.set(metric.modelName, {
            ...metric,
            lastEvaluated: new Date(metric.lastEvaluated)
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to load performance metrics', { error });
    }
  }

  private async updatePerformanceMetrics(): Promise<void> {
    try {
      const evaluations = await this.evaluateModels();
      
      for (const [modelName, accuracy] of Object.entries(evaluations)) {
        const recentPredictions = this.predictionHistory
          .filter(p => p.modelName === modelName)
          .slice(-100);

        const avgConfidence = recentPredictions.length > 0
          ? recentPredictions.reduce((sum, p) => sum + p.confidence, 0) / recentPredictions.length
          : 0;

        this.performanceMetrics.set(modelName, {
          modelName,
          version: '1.0.0',
          accuracy,
          precision: accuracy * 0.95, // Simplified metrics
          recall: accuracy * 0.9,
          f1Score: accuracy * 0.925,
          lastEvaluated: new Date(),
          predictionCount: recentPredictions.length,
          averageConfidence: avgConfidence
        });
      }

      // Save metrics to disk
      await this.savePerformanceMetrics();
    } catch (error) {
      logger.error('Failed to update performance metrics', { error });
    }
  }

  private async savePerformanceMetrics(): Promise<void> {
    try {
      const metricsPath = path.join(process.cwd(), 'models', 'performance-metrics.json');
      const metricsDir = path.dirname(metricsPath);
      
      if (!fs.existsSync(metricsDir)) {
        fs.mkdirSync(metricsDir, { recursive: true });
      }

      const metrics = Array.from(this.performanceMetrics.values());
      fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
    } catch (error) {
      logger.error('Failed to save performance metrics', { error });
    }
  }

  private getLastTrainingDate(): Date | null {
    try {
      const modelsDir = path.join(process.cwd(), 'models', 'saved');
      if (!fs.existsSync(modelsDir)) return null;

      let latestDate: Date | null = null;
      const modelDirs = fs.readdirSync(modelsDir);
      
      for (const modelDir of modelDirs) {
        const metadataPath = path.join(modelsDir, modelDir, 'metadata.json');
        if (fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          const savedAt = new Date(metadata.savedAt);
          if (!latestDate || savedAt > latestDate) {
            latestDate = savedAt;
          }
        }
      }

      return latestDate;
    } catch (error) {
      logger.warn('Failed to get last training date', { error });
      return null;
    }
  }

  async dispose(): Promise<void> {
    this.routeOptimizer.dispose();
    this.fuelPredictor.dispose();
    this.maintenanceForecaster.dispose();
    logger.info('AI Service disposed');
  }

  // Utility methods for advanced features
  async exportModels(exportPath: string): Promise<void> {
    try {
      if (!fs.existsSync(exportPath)) {
        fs.mkdirSync(exportPath, { recursive: true });
      }

      // Copy model files and metadata
      const modelsDir = path.join(process.cwd(), 'models', 'saved');
      if (fs.existsSync(modelsDir)) {
        fs.cpSync(modelsDir, path.join(exportPath, 'saved'), { recursive: true });
      }

      // Export performance metrics
      const metricsPath = path.join(process.cwd(), 'models', 'performance-metrics.json');
      if (fs.existsSync(metricsPath)) {
        fs.copyFileSync(metricsPath, path.join(exportPath, 'performance-metrics.json'));
      }

      logger.info('Models exported successfully', { exportPath });
    } catch (error) {
      logger.error('Failed to export models', { error, exportPath });
      throw error;
    }
  }

  async importModels(importPath: string): Promise<void> {
    try {
      const savedDir = path.join(importPath, 'saved');
      const metricsFile = path.join(importPath, 'performance-metrics.json');

      if (fs.existsSync(savedDir)) {
        const targetDir = path.join(process.cwd(), 'models', 'saved');
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
        fs.cpSync(savedDir, targetDir, { recursive: true });
      }

      if (fs.existsSync(metricsFile)) {
        const targetFile = path.join(process.cwd(), 'models', 'performance-metrics.json');
        fs.copyFileSync(metricsFile, targetFile);
      }

      // Reinitialize models
      await this.initialize();

      logger.info('Models imported successfully', { importPath });
    } catch (error) {
      logger.error('Failed to import models', { error, importPath });
      throw error;
    }
  }
}

// Singleton instance
let aiServiceInstance: AIService | null = null;

export const getAIService = (config?: Partial<AIServiceConfig>): AIService => {
  if (!aiServiceInstance) {
    aiServiceInstance = new AIService(config);
  }
  return aiServiceInstance;
}; 