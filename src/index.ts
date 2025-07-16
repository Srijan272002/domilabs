import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import voyageRoutes from './routes/voyageRoutes';
import maintenanceRoutes from './routes/maintenanceRoutes';
import aiRoutes from './routes/aiRoutes';
import { checkDatabaseConnection } from './utils/database';

// Load environment variables
dotenv.config();

// Validate critical environment variables
const validateEnvironment = () => {
  const criticalVars = [
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD'
  ];

  const missingVars = criticalVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    logger.error('Missing critical environment variables:', {
      missing: missingVars,
      environment: process.env.NODE_ENV
    });

    if (process.env.NODE_ENV === 'development') {
      logger.info('Development environment detected. Please check your .env file and ensure all required variables are set.');
      logger.info('Required variables:', criticalVars);
    }

    // In development, we can continue with warnings
    if (process.env.NODE_ENV !== 'development') {
      process.exit(1);
    }
  }

  // Validate AI-specific variables if AI features are enabled
  if (process.env.ENABLE_MODEL_TRAINING === 'true') {
    const aiVars = [
      'AI_AUTO_TRAIN',
      'AI_PERFORMANCE_THRESHOLD',
      'AI_MODEL_UPDATE_INTERVAL',
      'AI_ENABLE_VERSIONING',
      'AI_MAX_MODEL_VERSIONS'
    ];

    const missingAiVars = aiVars.filter(varName => !process.env[varName]);
    if (missingAiVars.length > 0) {
      logger.warn('Missing AI-related environment variables:', {
        missing: missingAiVars
      });
    }
  }
};

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbConnected = await checkDatabaseConnection();
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'OK' : 'ERROR',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      connected: dbConnected,
      status: dbConnected ? 'healthy' : 'unhealthy'
    }
  });
});

// API routes
app.use('/api/v1/voyages', voyageRoutes);
app.use('/api/v1/maintenance', maintenanceRoutes);
app.use('/api/v1/ai', aiRoutes);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Display environment information
const logEnvironmentInfo = () => {
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbName = process.env.DB_NAME || 'ship_planning';
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  logger.info('Environment configuration:', {
    environment: nodeEnv,
    port: PORT,
    database: {
      host: dbHost,
      name: dbName,
      user: process.env.DB_USER || 'postgres'
    }
  });
  
  // Provide helpful information for Docker users
  if (dbHost === 'localhost' && process.env.NODE_ENV !== 'production') {
    logger.info('Running in local mode. If using Docker for database, consider:');
    logger.info('1. Using Docker Compose: "docker-compose up"');
    logger.info('2. Or update .env to use correct Docker network settings');
  }
};

// Start server
const startServer = async () => {
  try {
    // Validate environment variables
    validateEnvironment();
    
    // Log environment information
    logEnvironmentInfo();
    
    // Check database connection before starting server
    logger.info('Checking database connection...');
    const dbConnected = await checkDatabaseConnection();
    
    if (!dbConnected) {
      logger.error('Failed to start server: Database connection failed');
      logger.info('Possible solutions:');
      logger.info('1. Check if PostgreSQL is running and accessible');
      logger.info('2. Verify database credentials in .env file');
      logger.info('3. If using Docker, ensure the database container is running');
      logger.info('4. For local development with Docker DB, update DB_HOST in .env to your Docker host IP');
      
      // In development, we can continue without DB for debugging
      if (process.env.NODE_ENV === 'development' && process.env.ALLOW_START_WITHOUT_DB === 'true') {
        logger.warn('Starting server without database connection (ALLOW_START_WITHOUT_DB=true)');
      } else {
        process.exit(1);
      }
    }

    app.listen(PORT, () => {
      logger.info(`Ship Planning API server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Database connection status: ${dbConnected ? 'Connected' : 'Disconnected'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
  }
};

startServer();

export default app; 