import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { logger } from '../utils/logger';

// Handle validation results
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map((error: any) => ({
      field: error.type === 'field' ? error.path : error.type,
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined
    }));

    logger.warn('Validation failed', {
      path: req.path,
      method: req.method,
      errors: errorDetails,
      ip: req.ip
    });

    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errorDetails
    });
    return;
  }

  next();
};

// Voyage planning validation
export const validateVoyagePlan = [
  body('origin')
    .notEmpty()
    .withMessage('Origin is required')
    .isObject()
    .withMessage('Origin must be an object'),
  body('origin.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Origin latitude must be between -90 and 90'),
  body('origin.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Origin longitude must be between -180 and 180'),
  body('destination')
    .notEmpty()
    .withMessage('Destination is required')
    .isObject()
    .withMessage('Destination must be an object'),
  body('destination.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Destination latitude must be between -90 and 90'),
  body('destination.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Destination longitude must be between -180 and 180'),
  body('shipId')
    .notEmpty()
    .withMessage('Ship ID is required')
    .isUUID()
    .withMessage('Ship ID must be a valid UUID'),
  body('departureTime')
    .optional()
    .isISO8601()
    .withMessage('Departure time must be a valid ISO 8601 date'),
  body('preferences')
    .optional()
    .isObject()
    .withMessage('Preferences must be an object'),
  body('preferences.priority')
    .optional()
    .isIn(['fuel_efficiency', 'time', 'safety', 'cost'])
    .withMessage('Priority must be one of: fuel_efficiency, time, safety, cost'),
  body('preferences.avoidWeather')
    .optional()
    .isBoolean()
    .withMessage('Avoid weather must be a boolean'),
  body('preferences.maxWaveHeight')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Max wave height must be a positive number')
];

// Voyage feedback validation
export const validateVoyageFeedback = [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comments')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Comments must be a string with maximum 1000 characters'),
  body('issues')
    .optional()
    .isArray()
    .withMessage('Issues must be an array'),
  body('issues.*')
    .optional()
    .isIn(['weather', 'mechanical', 'navigation', 'fuel', 'other'])
    .withMessage('Issues must be one of: weather, mechanical, navigation, fuel, other'),
  body('actualFuelConsumption')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Actual fuel consumption must be a positive number'),
  body('actualDuration')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Actual duration must be a positive integer (minutes)')
];

// Maintenance alert validation
export const validateMaintenanceAlert = [
  body('shipId')
    .notEmpty()
    .withMessage('Ship ID is required')
    .isUUID()
    .withMessage('Ship ID must be a valid UUID'),
  body('component')
    .notEmpty()
    .withMessage('Component is required')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Component must be between 1 and 100 characters'),
  body('alertType')
    .isIn(['preventive', 'corrective', 'emergency'])
    .withMessage('Alert type must be one of: preventive, corrective, emergency'),
  body('priority')
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Priority must be one of: low, medium, high, critical'),
  body('description')
    .notEmpty()
    .withMessage('Description is required')
    .isString()
    .isLength({ min: 10, max: 500 })
    .withMessage('Description must be between 10 and 500 characters'),
  body('estimatedCost')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Estimated cost must be a positive number'),
  body('scheduledDate')
    .isISO8601()
    .withMessage('Scheduled date must be a valid ISO 8601 date')
];

// Query parameter validation
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('sortBy')
    .optional()
    .isString()
    .withMessage('Sort by must be a string'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
];

// UUID parameter validation
export const validateUUIDParam = (paramName: string) => {
  return param(paramName)
    .isUUID()
    .withMessage(`${paramName} must be a valid UUID`);
};

// Date range validation
export const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
];

// Ship validation
export const validateShip = [
  body('name')
    .notEmpty()
    .withMessage('Ship name is required')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Ship name must be between 1 and 100 characters'),
  body('type')
    .isIn(['cargo', 'tanker', 'container', 'bulk_carrier', 'passenger'])
    .withMessage('Ship type must be one of: cargo, tanker, container, bulk_carrier, passenger'),
  body('specifications')
    .notEmpty()
    .withMessage('Specifications are required')
    .isObject()
    .withMessage('Specifications must be an object'),
  body('specifications.length')
    .isFloat({ min: 1 })
    .withMessage('Length must be a positive number'),
  body('specifications.width')
    .isFloat({ min: 1 })
    .withMessage('Width must be a positive number'),
  body('specifications.maxSpeed')
    .isFloat({ min: 1 })
    .withMessage('Max speed must be a positive number'),
  body('specifications.fuelCapacity')
    .isFloat({ min: 1 })
    .withMessage('Fuel capacity must be a positive number'),
  body('specifications.cargoCapacity')
    .isFloat({ min: 0 })
    .withMessage('Cargo capacity must be a non-negative number')
];

export default {
  handleValidationErrors,
  validateVoyagePlan,
  validateVoyageFeedback,
  validateMaintenanceAlert,
  validatePagination,
  validateUUIDParam,
  validateDateRange,
  validateShip
}; 