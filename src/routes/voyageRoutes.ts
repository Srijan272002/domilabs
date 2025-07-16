import { Router, Request, Response } from 'express';
import { 
  validateVoyagePlan, 
  validateVoyageFeedback, 
  validatePagination, 
  validateDateRange,
  handleValidationErrors 
} from '../middleware/validationMiddleware';
import { voyageService } from '../models/Voyage';
import { shipService } from '../models/Ship';
import { weatherService } from '../services/WeatherService';
import { logger } from '../utils/logger';

const router = Router();

// POST /plan-voyage - Plan a new voyage
router.post('/plan', 
  validateVoyagePlan,
  handleValidationErrors,
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { origin, destination, shipId, departureTime, preferences } = req.body;

      // Verify ship exists and user has access
      const ship = await shipService.findById(shipId);
      if (!ship) {
        return res.status(404).json({
          success: false,
          error: 'Ship not found'
        });
      }

      // Get weather analysis for the route
      const waypoints = [origin, destination];
      const weatherAnalysis = await weatherService.analyzeRouteWeather(waypoints);

      // Create voyage
      const voyage = await voyageService.create({
        shipId,
        origin,
        destination,
        preferences,
        plannedDepartureTime: departureTime ? new Date(departureTime) : undefined
      });

      logger.info('Voyage planned successfully', {
        voyageId: voyage.id,
        shipId,
        origin,
        destination
      });

      return res.status(201).json({
        success: true,
        message: 'Voyage planned successfully',
        data: { 
          voyage,
          weatherAnalysis
        }
      });
    } catch (error) {
      logger.error('Failed to plan voyage', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to plan voyage'
      });
    }
  }
);

// GET /history - Get voyage history
router.get('/history',
  validatePagination,
  validateDateRange,
  handleValidationErrors,
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { page, limit, sortBy, sortOrder, status, shipId, startDate, endDate } = req.query;

      const options = {
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        status: status as any,
        shipId: shipId as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      };

      const result = await voyageService.findAll(options);

      // Get ship details for each voyage
      const voyagesWithShips = await Promise.all(
        result.voyages.map(async (voyage) => {
          const ship = await shipService.findById(voyage.shipId);
          return {
            ...voyage,
            ship: ship ? {
              id: ship.id,
              name: ship.name,
              type: ship.type,
              status: ship.status
            } : null
          };
        })
      );

      res.status(200).json({
        success: true,
        message: 'Voyage history retrieved successfully',
        data: {
          voyages: voyagesWithShips,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: Math.ceil(result.total / result.limit)
          }
        }
      });
      return;
    } catch (error) {
      logger.error('Failed to fetch voyage history', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query: req.query
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch voyage history'
      });
    }
  }
);

// GET /:id - Get specific voyage details
router.get('/:id',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { id } = req.params;

      const voyage = await voyageService.findById(id);
      if (!voyage) {
        return res.status(404).json({
          success: false,
          error: 'Voyage not found'
        });
      }

      // Get ship details
      const ship = await shipService.findById(voyage.shipId);

      // Calculate route metrics
      const distance = calculateDistance(voyage.origin, voyage.destination);
      const actualDuration = voyage.actualArrivalTime && voyage.actualDepartureTime
        ? Math.round((voyage.actualArrivalTime.getTime() - voyage.actualDepartureTime.getTime()) / (1000 * 60))
        : null;

      return res.status(200).json({
        success: true,
        message: 'Voyage details retrieved successfully',
        data: {
          voyage,
          ship: ship ? {
            id: ship.id,
            name: ship.name,
            type: ship.type,
            status: ship.status,
            specifications: ship.specifications
          } : null,
          metrics: {
            distance: Math.round(distance * 100) / 100,
            actualDuration,
            fuelEfficiency: voyage.actualFuelConsumption && distance > 0 
              ? Math.round((voyage.actualFuelConsumption / distance) * 100) / 100 
              : null
          }
        }
      });
    } catch (error) {
      logger.error('Failed to fetch voyage details', {
        error: error instanceof Error ? error.message : 'Unknown error',
        voyageId: req.params.id
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch voyage details'
      });
    }
  }
);

// PUT /:id/status - Update voyage status
router.put('/:id/status',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      if (!status || !['planned', 'in_progress', 'completed', 'cancelled', 'delayed'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status. Must be one of: planned, in_progress, completed, cancelled, delayed'
        });
      }

      const voyage = await voyageService.updateStatus(id, status);
      if (!voyage) {
        return res.status(404).json({
          success: false,
          error: 'Voyage not found'
        });
      }

      logger.info('Voyage status updated', {
        voyageId: id,
        newStatus: status
      });

      return res.status(200).json({
        success: true,
        message: 'Voyage status updated successfully',
        data: { voyage }
      });
    } catch (error) {
      logger.error('Failed to update voyage status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        voyageId: req.params.id
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to update voyage status'
      });
    }
  }
);

// POST /:id/feedback - Add voyage feedback
router.post('/:id/feedback',
  validateVoyageFeedback,
  handleValidationErrors,
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { id } = req.params;
      const { rating, comments, issues, actualFuelConsumption, actualDuration } = req.body;

      const feedback = {
        rating,
        comments,
        issues
      };

      const voyage = await voyageService.addFeedback(id, feedback);
      if (!voyage) {
        return res.status(404).json({
          success: false,
          error: 'Voyage not found'
        });
      }

      // Update actual metrics if provided
      if (actualFuelConsumption || actualDuration) {
        const updateData: any = {};
        if (actualFuelConsumption) updateData.actualFuelConsumption = actualFuelConsumption;
        if (actualDuration) {
          // Calculate actual arrival time based on duration
          if (voyage.actualDepartureTime) {
            updateData.actualArrivalTime = new Date(voyage.actualDepartureTime.getTime() + (actualDuration * 60000));
          }
        }
        
        await voyageService.update(id, updateData);
      }

      logger.info('Voyage feedback added', {
        voyageId: id,
        rating
      });

      return res.status(200).json({
        success: true,
        message: 'Voyage feedback added successfully',
        data: { voyage }
      });
    } catch (error) {
      logger.error('Failed to add voyage feedback', {
        error: error instanceof Error ? error.message : 'Unknown error',
        voyageId: req.params.id
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to add voyage feedback'
      });
    }
  }
);

// GET /stats/:shipId - Get voyage statistics for a ship
router.get('/stats/:shipId',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { shipId } = req.params;

      const stats = await voyageService.getVoyageStats(shipId);

      return res.status(200).json({
        success: true,
        message: 'Voyage statistics retrieved successfully',
        data: { stats }
      });
    } catch (error) {
      logger.error('Failed to fetch voyage statistics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        shipId: req.params.shipId
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch voyage statistics'
      });
    }
  }
);

// Utility functions
function calculateDistance(origin: { latitude: number; longitude: number }, destination: { latitude: number; longitude: number }): number {
  // Haversine formula
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(destination.latitude - origin.latitude);
  const dLon = toRadians(destination.longitude - origin.longitude);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRadians(origin.latitude)) * Math.cos(toRadians(destination.latitude)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI/180);
}

function calculateEstimatedDuration(distanceKm: number, maxSpeedKmh: number, preferences: any): number {
  const averageSpeed = preferences.preferredSpeed || (maxSpeedKmh * 0.8); // 80% of max speed
  return Math.round((distanceKm / averageSpeed) * 60); // Return duration in minutes
}

function calculateEstimatedFuelConsumption(distanceKm: number, specifications: any): number {
  // Simplified fuel consumption calculation
  const baseFuelRate = 0.15; // L/km base rate
  const speedFactor = specifications.maxSpeed > 25 ? 1.2 : 1.0;
  const sizeFactor = specifications.length > 200 ? 1.5 : 1.0;
  
  return distanceKm * baseFuelRate * speedFactor * sizeFactor;
}

export default router; 