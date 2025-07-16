import { Router, Request, Response, NextFunction } from 'express';
import { getAIService } from '../services/AI/AIService';
import { logger } from '../utils/logger';

const router = Router();
const aiService = getAIService();

// Initialize AI service
let serviceInitialized = false;
let initializationError: Error | null = null;

const initializeService = async () => {
  try {
    await aiService.initialize();
    serviceInitialized = true;
    logger.info('AI service initialized successfully');
  } catch (error) {
    initializationError = error instanceof Error ? error : new Error('Unknown error during initialization');
    logger.error('Failed to initialize AI service', { error });
  }
};

// Start initialization
initializeService();

// Middleware to check service status
const checkServiceStatus = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
  if (!serviceInitialized) {
    if (initializationError) {
      return res.status(503).json({
        success: false,
        error: 'AI service failed to initialize',
        details: initializationError.message
      });
    }
    try {
      await initializeService();
      if (!serviceInitialized) {
        return res.status(503).json({
          success: false,
          error: 'AI service is still initializing'
        });
      }
    } catch (error) {
      return res.status(503).json({
        success: false,
        error: 'Failed to initialize AI service'
      });
    }
  }
  next();
  return;
};

// Apply service check middleware to all AI routes
router.use(checkServiceStatus);

// POST /ai/route/optimize - Optimize ship route
router.post('/route/optimize',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const routeInput = req.body;

      // Validate required fields
      if (!routeInput.origin || !routeInput.destination || !routeInput.shipSpecs) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: origin, destination, or shipSpecs'
        });
      }

      const optimization = await aiService.optimizeRoute(routeInput);

      logger.info('Route optimization request completed', {
        distance: optimization.totalDistance,
        estimatedTime: optimization.estimatedTime
      });

      return res.status(200).json({
        success: true,
        message: 'Route optimized successfully',
        data: { optimization }
      });
    } catch (error) {
      logger.error('Route optimization failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to optimize route'
      });
    }
  }
);

// POST /ai/fuel/predict - Predict fuel consumption
router.post('/fuel/predict',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const fuelInput = req.body;

      // Validate required fields
      if (!fuelInput.voyage || !fuelInput.ship || !fuelInput.conditions) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: voyage, ship, or conditions'
        });
      }

      const prediction = await aiService.predictFuelConsumption(fuelInput);

      logger.info('Fuel prediction request completed', {
        totalConsumption: prediction.totalConsumption,
        confidence: prediction.confidence
      });

      return res.status(200).json({
        success: true,
        message: 'Fuel consumption predicted successfully',
        data: { prediction }
      });
    } catch (error) {
      logger.error('Fuel prediction failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to predict fuel consumption'
      });
    }
  }
);

// POST /ai/maintenance/predict - Predict maintenance needs
router.post('/maintenance/predict',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const maintenanceInput = req.body;

      // Validate required fields
      if (!maintenanceInput || typeof maintenanceInput !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body: expected maintenance input object'
        });
      }

      // Validate ship data
      if (!maintenanceInput.ship || typeof maintenanceInput.ship !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid ship data'
        });
      }

      // Validate component data
      if (!maintenanceInput.component || typeof maintenanceInput.component !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid component data'
        });
      }

      // Validate usage data
      if (!maintenanceInput.usage || typeof maintenanceInput.usage !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid usage data'
        });
      }

      // Validate required ship fields
      const requiredShipFields = ['id', 'type', 'age', 'hoursOperated'];
      const missingShipFields = requiredShipFields.filter(field => !maintenanceInput.ship[field]);
      if (missingShipFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Missing required ship fields: ${missingShipFields.join(', ')}`
        });
      }

      // Validate required component fields
      const requiredComponentFields = ['type', 'lastMaintenanceDate'];
      const missingComponentFields = requiredComponentFields.filter(field => !maintenanceInput.component[field]);
      if (missingComponentFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Missing required component fields: ${missingComponentFields.join(', ')}`
        });
      }

      // Validate required usage fields
      const requiredUsageFields = ['dailyOperatingHours', 'environmentalConditions'];
      const missingUsageFields = requiredUsageFields.filter(field => !maintenanceInput.usage[field]);
      if (missingUsageFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Missing required usage fields: ${missingUsageFields.join(', ')}`
        });
      }

      const prediction = await aiService.predictMaintenance(maintenanceInput);

      logger.info('Maintenance prediction request completed', {
        shipId: maintenanceInput.ship.id,
        component: maintenanceInput.component.type,
        riskScore: prediction.riskScore,
        confidence: prediction.confidence
      });

      return res.status(200).json({
        success: true,
        message: 'Maintenance prediction completed successfully',
        data: { prediction }
      });
    } catch (error) {
      // Log detailed error information
      logger.error('Maintenance prediction failed', {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : 'Unknown error',
        input: {
          shipId: req.body?.ship?.id,
          componentType: req.body?.component?.type
        }
      });

      // Return appropriate error response
      if (error instanceof Error && error.message.includes('validation')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid input data',
          details: error.message
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to predict maintenance needs',
        timestamp: new Date().toISOString() // Use timestamp instead of request ID
      });
    }
  }
);

// POST /ai/fleet/health - Analyze fleet health
router.post('/fleet/health',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { maintenanceInputs } = req.body;

      if (!Array.isArray(maintenanceInputs) || maintenanceInputs.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'maintenanceInputs must be a non-empty array'
        });
      }

      const health = await aiService.analyzeFleetHealth(maintenanceInputs);

      logger.info('Fleet health analysis completed', {
        shipsAnalyzed: maintenanceInputs.length,
        overallHealth: health.overall
      });

      return res.status(200).json({
        success: true,
        message: 'Fleet health analysis completed successfully',
        data: { health }
      });
    } catch (error) {
      logger.error('Fleet health analysis failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to analyze fleet health'
      });
    }
  }
);

// GET /ai/status - Get AI service status
router.get('/status',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const status = await aiService.getServiceStatus();

      return res.status(200).json({
        success: true,
        message: 'AI service status retrieved successfully',
        data: { status }
      });
    } catch (error) {
      logger.error('Failed to get AI service status', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve AI service status'
      });
    }
  }
);

// POST /ai/models/train - Train all AI models
router.post('/models/train',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      // This is a long-running operation, so we'll start it and return immediately
      aiService.trainAllModels().catch(error => {
        logger.error('Background model training failed', { error });
      });

      logger.info('Model training initiated');

      return res.status(202).json({
        success: true,
        message: 'Model training initiated successfully',
        data: { 
          status: 'training_started',
          note: 'Training is running in the background. Check /ai/status for updates.'
        }
      });
    } catch (error) {
      logger.error('Failed to initiate model training', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to initiate model training'
      });
    }
  }
);

// GET /ai/models/evaluate - Evaluate model performance
router.get('/models/evaluate',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const evaluations = await aiService.evaluateModels();

      logger.info('Model evaluation completed', {
        evaluations
      });

      return res.status(200).json({
        success: true,
        message: 'Model evaluation completed successfully',
        data: { evaluations }
      });
    } catch (error) {
      logger.error('Model evaluation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to evaluate models'
      });
    }
  }
);

// POST /ai/models/export - Export trained models
router.post('/models/export',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { exportPath } = req.body;

      if (!exportPath) {
        return res.status(400).json({
          success: false,
          error: 'exportPath is required'
        });
      }

      await aiService.exportModels(exportPath);

      logger.info('Models exported successfully', {
        exportPath
      });

      return res.status(200).json({
        success: true,
        message: 'Models exported successfully',
        data: { exportPath }
      });
    } catch (error) {
      logger.error('Model export failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to export models'
      });
    }
  }
);

// POST /ai/models/import - Import trained models
router.post('/models/import',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { importPath } = req.body;

      if (!importPath) {
        return res.status(400).json({
          success: false,
          error: 'importPath is required'
        });
      }

      await aiService.importModels(importPath);

      logger.info('Models imported successfully', {
        importPath
      });

      return res.status(200).json({
        success: true,
        message: 'Models imported successfully',
        data: { importPath }
      });
    } catch (error) {
      logger.error('Model import failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to import models'
      });
    }
  }
);

// GET /ai/examples - Get example input formats for testing
router.get('/examples',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const examples = {
        routeOptimization: {
          origin: { latitude: 40.7128, longitude: -74.0060 },
          destination: { latitude: 51.5074, longitude: -0.1278 },
          shipSpecs: {
            maxSpeed: 25,
            fuelCapacity: 5000,
            cargoCapacity: 1000,
            currentCargoWeight: 600
          },
          weatherConditions: {
            windSpeed: 15,
            waveHeight: 2.5,
            visibility: 8,
            temperature: 20
          },
          preferences: {
            prioritizeFuel: true,
            prioritizeTime: false,
            avoidRoughSeas: true
          }
        },
        fuelPrediction: {
          voyage: {
            distance: 3000,
            duration: 120,
            averageSpeed: 22
          },
          ship: {
            type: "container",
            length: 300,
            beam: 45,
            displacement: 50000,
            enginePower: 25000,
            maxSpeed: 25,
            cargoWeight: 35000,
            cargoCapacity: 50000
          },
          conditions: {
            windSpeed: 20,
            windDirection: 45,
            waveHeight: 3,
            currentSpeed: 2,
            currentDirection: 90,
            temperature: 18,
            seaState: 4
          },
          operational: {
            cruisingSpeed: 22,
            loadFactor: 0.7,
            mainEngineLoad: 0.8,
            auxiliaryLoad: 0.6,
            hvacLoad: 0.4
          }
        },
        maintenancePrediction: {
          ship: {
            id: "ship-001",
            type: "container",
            age: 12,
            length: 300,
            enginePower: 25000,
            hoursOperated: 45000
          },
          component: {
            type: "engine",
            lastMaintenanceDate: "2024-01-15T00:00:00Z",
            maintenanceHistory: [
              {
                date: "2024-01-15T00:00:00Z",
                type: "preventive",
                cost: 15000,
                downtime: 24,
                description: "Regular engine maintenance"
              }
            ],
            operatingConditions: {
              averageLoad: 0.75,
              temperature: 60,
              vibration: 3.2,
              pressure: 25
            }
          },
          usage: {
            dailyOperatingHours: 18,
            voyagesPerMonth: 8,
            averageVoyageDistance: 2500,
            environmentalConditions: {
              saltWaterExposure: 0.9,
              temperatureVariation: 30,
              roughSeaExposure: 0.6
            }
          },
          sensors: {
            temperature: [58, 60, 62, 59, 61],
            vibration: [3.0, 3.2, 3.1, 3.3, 3.2],
            pressure: [24, 25, 25, 26, 25],
            efficiency: [0.85, 0.84, 0.83, 0.82, 0.81],
            lastReadings: {
              temperature: 61,
              vibration: 3.2,
              pressure: 25,
              efficiency: 0.81
            }
          }
        }
      };

      return res.status(200).json({
        success: true,
        message: 'AI API examples retrieved successfully',
        data: { examples }
      });
    } catch (error) {
      logger.error('Failed to get AI examples', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve examples'
      });
    }
  }
);

export default router; 