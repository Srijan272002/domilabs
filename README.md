# 🚢 Ship Planning & Optimization System

An AI-powered backend service that optimizes maritime operations through intelligent voyage planning, fuel consumption prediction, and maintenance scheduling. This system serves as the **"Planning Brain"** for smart ships, providing comprehensive operational intelligence.

## 🎯 Features

- **Intelligent Voyage Planning**: AI-optimized route planning considering weather, cargo, and efficiency
- **Fuel Consumption Prediction**: Machine learning models for accurate fuel consumption forecasting
- **Predictive Maintenance**: AI-driven maintenance scheduling and alerts
- **Real-time Weather Integration**: Dynamic weather analysis for route optimization
- **Performance Analytics**: Continuous monitoring and optimization insights
- **Multi-Model AI System**: Three specialized neural network models working together

## 🛠️ Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Knex.js migrations
- **AI/ML**: TensorFlow.js for machine learning models
- **Infrastructure**: Docker + Docker Compose (multi-stage builds)
- **Testing**: Jest + Supertest
- **Logging**: Winston for structured logging
- **Validation**: Express-validator + Joi

## 🚀 Setup Instructions

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL (if running locally)

### Option 1: Docker Setup (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Domilabs
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start all services with Docker**
   ```bash
   npm run docker:up
   ```

   This will start:
   - PostgreSQL database on port 5432
   - Redis cache on port 6379  
   - Ship Planning API on port 3000

4. **Verify the setup**
   ```bash
   # Check if all containers are running
   docker-compose ps
   
   # Test the API
   curl http://localhost:3000/health
   ```

### Option 2: Local Development Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Configure your local database settings
   ```

3. **Set up the database**
   ```bash
   # Run migrations
   npm run migrate
   
   # Seed with sample data
   npm run seed
   ```
   
4. **Start the development server**
   ```bash
   npm run dev
   ```

### Environment Variables

Create a `.env` file with the following variables:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ship_planning
DB_USER=postgres
DB_PASSWORD=password

# API Configuration
PORT=3000
NODE_ENV=development

# Weather API (optional)
WEATHER_API_KEY=your_weather_api_key
WEATHER_API_URL=https://api.weatherapi.com/v1

# AI Configuration
AI_AUTO_TRAIN=true
AI_PERFORMANCE_THRESHOLD=0.8
AI_MODEL_UPDATE_INTERVAL=24
AI_ENABLE_VERSIONING=true
AI_MAX_MODEL_VERSIONS=5
```

## 📋 API Documentation

### Base URL
```
http://localhost:3000
```

### Core Endpoints

#### 1. Plan Voyage
**POST** `/api/v1/voyages/plan`

Plan an optimized voyage with AI-powered route optimization.

**Request Body:**
```json
{
  "origin": {
    "latitude": 40.7128,
    "longitude": -74.0060
  },
  "destination": {
    "latitude": 51.5074,
    "longitude": -0.1278
  },
  "shipId": "123e4567-e89b-12d3-a456-426614174000",
  "departureTime": "2024-03-20T10:00:00Z",
  "preferences": {
    "prioritizeFuel": true,
    "prioritizeTime": false,
    "avoidRoughSeas": true,
    "preferredSpeed": 22
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Voyage planned successfully",
  "data": {
    "voyage": {
      "id": "voyage-uuid",
      "shipId": "123e4567-e89b-12d3-a456-426614174000",
      "origin": "New York",
      "destination": "London",
      "status": "planned",
      "estimatedArrival": "2024-03-25T10:00:00Z",
      "estimatedFuelConsumption": 4500.5,
      "estimatedDistance": 3200.2
    },
    "weatherAnalysis": {
      "overallRisk": "low",
      "routeSegments": [...],
      "alerts": [...]
    }
  }
}
```

#### 2. Get Voyage History
**GET** `/api/v1/voyages/history?page=1&limit=10`

Retrieve voyage history with pagination.

**Response:**
```json
{
  "success": true,
  "data": {
    "voyages": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 45,
      "pages": 5
    }
  }
}
```

#### 3. Submit Voyage Feedback
**POST** `/api/v1/voyages/feedback`

Submit feedback for completed voyages to improve AI models.

**Request Body:**
```json
{
  "voyageId": "voyage-uuid",
  "actualFuelConsumption": 4800.2,
  "actualDuration": 125.5,
  "weatherConditions": "moderate",
  "routeEfficiency": 0.85,
  "comments": "Route was efficient but encountered unexpected weather"
}
```

#### 4. Get Maintenance Alerts
**GET** `/api/v1/maintenance/alerts`

Get predictive maintenance alerts for the fleet.

**Response:**
```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "shipId": "ship-uuid",
        "component": "main_engine",
        "riskScore": 0.75,
        "predictedFailureDate": "2024-04-15T00:00:00Z",
        "recommendedMaintenanceDate": "2024-04-01T00:00:00Z",
        "maintenanceType": "preventive",
        "estimatedCost": 15000,
        "priority": "high"
      }
    ]
  }
}
```

### AI/ML Endpoints

#### 1. Route Optimization
**POST** `/api/v1/ai/route/optimize`

AI-powered route optimization considering multiple factors.

**Request Body:**
```json
{
  "origin": {
    "latitude": 40.7128,
    "longitude": -74.0060
  },
  "destination": {
    "latitude": 51.5074,
    "longitude": -0.1278
  },
  "shipSpecs": {
    "maxSpeed": 25,
    "fuelCapacity": 5000,
    "cargoCapacity": 1000,
    "currentCargoWeight": 600
  },
  "weatherConditions": {
    "windSpeed": 15,
    "waveHeight": 2.5,
    "visibility": 8,
    "temperature": 20
  },
  "preferences": {
    "prioritizeFuel": true,
    "prioritizeTime": false,
    "avoidRoughSeas": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Route optimized successfully",
  "data": {
    "optimization": {
      "optimizedRoute": [
        {"latitude": 40.7128, "longitude": -74.0060},
        {"latitude": 45.1234, "longitude": -50.5678},
        {"latitude": 51.5074, "longitude": -0.1278}
      ],
      "estimatedTime": 120.5,
      "estimatedFuelConsumption": 4200.3,
      "weatherRiskScore": 0.15,
      "totalDistance": 3150.8,
      "alternativeRoutes": [...]
    }
  }
}
```

#### 2. Fuel Consumption Prediction
**POST** `/api/v1/ai/fuel/predict`

Predict fuel consumption using machine learning.

**Request Body:**
```json
{
  "voyage": {
    "distance": 3000,
    "duration": 120,
    "averageSpeed": 22
  },
  "ship": {
    "type": "container",
    "length": 300,
    "beam": 45,
    "displacement": 50000,
    "enginePower": 25000,
    "maxSpeed": 25,
    "cargoWeight": 35000,
    "cargoCapacity": 50000
  },
  "conditions": {
    "windSpeed": 20,
    "windDirection": 45,
    "waveHeight": 3,
    "currentSpeed": 2,
    "currentDirection": 90,
    "temperature": 18,
    "seaState": 4
  },
  "operational": {
    "cruisingSpeed": 22,
    "loadFactor": 0.7,
    "mainEngineLoad": 0.8,
    "auxiliaryLoad": 0.6,
    "hvacLoad": 0.4
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "prediction": {
      "totalFuelConsumption": 4850.2,
      "mainEngineConsumption": 4200.5,
      "auxiliaryConsumption": 649.7,
      "fuelEfficiency": 0.62,
      "co2Emissions": 15250.8,
      "confidence": 0.89
    }
  }
}
```

#### 3. Maintenance Prediction
**POST** `/api/v1/ai/maintenance/predict`

Predict maintenance needs using AI.

**Request Body:**
```json
{
  "ship": {
    "id": "ship-001",
    "type": "container",
    "age": 12,
    "length": 300,
    "enginePower": 25000,
    "hoursOperated": 45000
  },
  "component": {
    "type": "engine",
    "lastMaintenanceDate": "2024-01-15T00:00:00Z",
    "maintenanceHistory": [...],
    "operatingConditions": {
      "averageLoad": 0.75,
      "temperature": 60,
      "vibration": 3.2,
      "pressure": 25
    }
  },
  "usage": {
    "dailyOperatingHours": 18,
    "voyagesPerMonth": 8,
    "averageVoyageDistance": 2500,
    "environmentalConditions": {
      "saltWaterExposure": 0.9,
      "temperatureVariation": 30,
      "roughSeaExposure": 0.6
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "prediction": {
      "riskScore": 0.75,
      "predictedFailureDate": "2024-04-15T00:00:00Z",
      "recommendedMaintenanceDate": "2024-04-01T00:00:00Z",
      "maintenanceType": "preventive",
      "estimatedCost": 15000,
      "downtimeEstimate": 48,
      "confidence": 0.82
    }
  }
}
```

#### 4. Fleet Health Analysis
**POST** `/api/v1/ai/fleet/health`

Analyze overall fleet health and performance.

**Response:**
```json
{
  "success": true,
  "data": {
    "fleetHealth": {
      "overallScore": 0.78,
      "ships": [...],
      "criticalAlerts": 2,
      "maintenanceDue": 5,
      "efficiencyTrend": "improving"
    }
  }
}
```

### Utility Endpoints

#### Health Check
**GET** `/health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-03-20T10:00:00Z",
  "services": {
    "database": "connected",
    "ai": "ready",
    "weather": "connected"
  }
}
```

#### AI Service Status
**GET** `/api/v1/ai/status`

**Response:**
```json
{
  "success": true,
  "data": {
    "models": {
      "routeOptimizer": {
        "status": "ready",
        "version": "1.2.0",
        "accuracy": 0.89,
        "lastTraining": "2024-03-15T00:00:00Z"
      },
      "fuelPredictor": {
        "status": "ready",
        "version": "1.1.5",
        "accuracy": 0.92,
        "lastTraining": "2024-03-14T00:00:00Z"
      },
      "maintenanceForecaster": {
        "status": "ready",
        "version": "1.0.8",
        "accuracy": 0.85,
        "lastTraining": "2024-03-13T00:00:00Z"
      }
    },
    "performance": {
      "averageResponseTime": 245,
      "totalPredictions": 15420,
      "successRate": 0.98
    }
  }
}
```

## 🤖 AI Models Description

The system includes three specialized AI models that work together to provide comprehensive planning intelligence:

### 1. Route Optimizer Model
**Purpose**: Optimizes ship routes considering multiple factors including weather conditions, fuel efficiency, time constraints, and cargo requirements.

**Key Features**:
- Neural network with 4 hidden layers (64, 32, 16 neurons)
- Considers 15 input features including coordinates, ship specs, weather, and preferences
- Generates optimized waypoints and alternative routes
- Provides weather risk scoring and efficiency metrics

**Input Features**:
- Origin and destination coordinates
- Ship specifications (speed, capacity, cargo weight)
- Weather conditions (wind, waves, visibility, temperature)
- Route preferences (prioritize fuel/time, avoid rough seas)
- Seasonal factors

**Output**:
- Optimized route waypoints
- Estimated time and fuel consumption
- Weather risk score (0-1 scale)
- Alternative route options

### 2. Fuel Predictor Model
**Purpose**: Accurately predicts fuel consumption for ship voyages based on comprehensive operational and environmental data.

**Key Features**:
- Deep neural network with batch normalization
- 5 hidden layers (128, 64, 32, 16 neurons)
- 20 input features for comprehensive analysis
- Provides breakdown of main engine vs auxiliary consumption

**Input Features**:
- Voyage details (distance, duration, speed)
- Ship characteristics (type, dimensions, engine power)
- Environmental conditions (wind, waves, currents, temperature)
- Operational parameters (load factor, engine usage, HVAC)

**Output**:
- Total fuel consumption prediction
- Main engine vs auxiliary consumption breakdown
- Fuel efficiency metrics
- CO2 emissions estimation

### 3. Maintenance Forecaster Model
**Purpose**: Predicts maintenance needs and schedules based on equipment usage, environmental conditions, and sensor data.

**Key Features**:
- Deep neural network with progressive dropout
- 5 hidden layers with batch normalization
- 25 input features for comprehensive analysis
- Provides risk scoring and cost estimates

**Input Features**:
- Ship and component characteristics
- Maintenance history and patterns
- Usage patterns and environmental exposure
- Real-time sensor data (temperature, vibration, pressure, efficiency)
- Operational conditions

**Output**:
- Risk score (0-1 scale)
- Predicted failure date
- Recommended maintenance date and type
- Cost and downtime estimates

## 🧠 Planning Intelligence System

The system provides comprehensive **planning intelligence** through several key mechanisms:

### 1. Multi-Factor Decision Making
The AI models consider multiple factors simultaneously:
- **Weather Intelligence**: Real-time weather analysis and forecasting
- **Operational Intelligence**: Ship performance, cargo optimization, and efficiency metrics
- **Predictive Intelligence**: Maintenance forecasting and risk assessment
- **Economic Intelligence**: Cost optimization and fuel efficiency

### 2. Continuous Learning & Adaptation
- **Feedback Loop**: Voyage feedback improves model accuracy over time
- **Performance Monitoring**: Continuous tracking of prediction accuracy
- **Model Retraining**: Automatic model updates based on performance thresholds
- **Version Control**: Model versioning for rollback and comparison

### 3. Real-Time Optimization
- **Dynamic Route Adjustment**: Real-time route optimization based on changing conditions
- **Weather Integration**: Live weather data integration for route planning
- **Performance Analytics**: Real-time monitoring of voyage performance
- **Alert System**: Proactive alerts for maintenance and operational issues

### 4. Comprehensive Planning Workflow
1. **Route Planning**: AI-optimized route generation with weather consideration
2. **Fuel Planning**: Accurate fuel consumption prediction for cost optimization
3. **Maintenance Planning**: Predictive maintenance scheduling to prevent downtime
4. **Performance Monitoring**: Continuous tracking and optimization
5. **Feedback Integration**: Learning from actual voyage data to improve future planning

### 5. Intelligent Decision Support
- **Risk Assessment**: Comprehensive risk scoring for routes and operations
- **Cost Optimization**: Balance between fuel efficiency, time, and maintenance costs
- **Alternative Planning**: Multiple route and strategy options
- **Performance Insights**: Detailed analytics and recommendations

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint

# Run type checking
npm run build
```

## 📦 Docker Commands

```bash
# Build and start all services
npm run docker:up

# Stop all services
npm run docker:down

# Build Docker image only
npm run docker:build

# View logs
docker-compose logs -f app

# Rebuild and restart
docker-compose down && docker-compose up --build
```

## 🗄️ Database

The system uses PostgreSQL with the following main tables:
- `ships` - Vessel information and specifications
- `voyages` - Trip planning and execution data
- `fuel_logs` - Time-series fuel consumption data
- `maintenance` - Maintenance schedules and predictions

### Database Operations

```bash
# Run migrations
npm run migrate

# Seed test data
npm run seed

# Reset database
npm run migrate:reset
```

## 🔧 Development

### Project Structure

```
src/
├── services/        # Business logic & AI services
│   └── AI/         # AI/ML models and services
├── routes/          # API routes
├── middleware/      # Express middleware
├── models/          # Data models
├── utils/           # Utility functions
├── types/           # TypeScript types
├── config/          # Configuration files
└── validators/      # Input validation
```

### Code Quality

- ESLint + Prettier for code formatting
- TypeScript for type safety
- Jest for testing
- Multi-stage Docker builds for optimization

## 📈 Monitoring & Logging

- Winston for structured logging
- Health check endpoint at `/health` with Docker health checks
- Error tracking and performance monitoring
- AI model performance metrics

## 🚀 Deployment

The application is containerized with multi-stage Docker builds and ready for deployment to:
- AWS (EC2, Fargate, Lambda)
- Google Cloud Platform
- Microsoft Azure
- Any Docker-compatible platform

### Docker Build Optimizations

- Multi-stage builds for smaller production images
- Build dependency isolation (Python, make, g++)
- Production-only dependency installation
- Non-root user for security
- Health checks and proper signal handling

## 🔒 Security

- Input validation and sanitization
- Rate limiting
- Helmet.js for security headers
- Non-root Docker containers
- Environment variable configuration

## 🐛 Troubleshooting

### Common Issues

1. **Docker Build Fails**
   - Ensure Docker Desktop is running
   - Clear Docker build cache: `docker builder prune`

2. **Database Connection Issues**
   - Check if PostgreSQL container is running: `docker-compose ps`
   - Verify environment variables in `.env`
   - For local development with Docker DB, use `DB_HOST=localhost`

3. **AI Model Initialization**
   - Check TensorFlow.js installation
   - Verify model directory permissions
   - Monitor logs for training progress

4. **Port Conflicts**
   - Ensure ports 3000, 5432, 6379 are available
   - Update docker-compose.yml if needed

### Health Checks

The application includes comprehensive health checks:
- Docker health check via `healthcheck.js`
- Database connection verification
- AI service status monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

--- 

For detailed AI model documentation, see [AI_MODELS_README.md](./AI_MODELS_README.md). 