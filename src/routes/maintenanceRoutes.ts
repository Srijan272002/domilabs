import { Router, Request, Response } from 'express';
import { 
  validateMaintenanceAlert, 
  validatePagination, 
  validateDateRange,
  validateUUIDParam,
  handleValidationErrors 
} from '../middleware/validationMiddleware';
import { maintenanceService } from '../models/Maintenance';
import { shipService } from '../models/Ship';
import { logger } from '../utils/logger';

const router = Router();

// GET /alerts - Get maintenance alerts
router.get('/alerts',
  validatePagination,
  handleValidationErrors,
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { page, limit, shipId, priority, status, overdue } = req.query;

      const options = {
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        shipId: shipId as string,
        priority: priority as any,
        status: status as any,
        overdue: overdue === 'true'
      };

      const result = await maintenanceService.findAll(options);

      // Get ship details for each maintenance record
      const maintenanceWithShips = await Promise.all(
        result.maintenanceRecords.map(async (maintenance) => {
          const ship = await shipService.findById(maintenance.shipId);
          return {
            ...maintenance,
            ship: ship ? {
              id: ship.id,
              name: ship.name,
              type: ship.type,
              status: ship.status
            } : null
          };
        })
      );

      return res.status(200).json({
        success: true,
        message: 'Maintenance alerts retrieved successfully',
        data: {
          records: maintenanceWithShips,
          total: result.total,
          page: options.page || 1,
          limit: options.limit || 10
        }
      });
    } catch (error) {
      logger.error('Failed to fetch maintenance alerts', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch maintenance alerts'
      });
    }
  }
);

// POST /alerts - Create maintenance alert
router.post('/alerts',
  validateMaintenanceAlert,
  handleValidationErrors,
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { shipId, component, alertType, priority, description, estimatedCost, scheduledDate, technician, location, parts, notes } = req.body;

      // Verify ship exists
      const ship = await shipService.findById(shipId);
      if (!ship) {
        return res.status(404).json({
          success: false,
          error: 'Ship not found'
        });
      }

      const maintenanceRecord = await maintenanceService.create({
        shipId,
        component,
        alertType,
        priority,
        description,
        estimatedCost,
        scheduledDate: new Date(scheduledDate),
        technician,
        location,
        parts,
        notes
      });

      logger.info('Maintenance alert created', {
        maintenanceId: maintenanceRecord.id,
        shipId,
        component,
        priority
      });

      return res.status(201).json({
        success: true,
        message: 'Maintenance alert created successfully',
        data: { maintenance: maintenanceRecord }
      });
    } catch (error) {
      logger.error('Failed to create maintenance alert', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to create maintenance alert'
      });
    }
  }
);

// GET /alerts/:id - Get specific maintenance alert
router.get('/alerts/:id',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { id } = req.params;

      const maintenance = await maintenanceService.findById(id);
      if (!maintenance) {
        return res.status(404).json({
          success: false,
          error: 'Maintenance record not found'
        });
      }

      // Get ship details
      const ship = await shipService.findById(maintenance.shipId);

      return res.status(200).json({
        success: true,
        message: 'Maintenance alert retrieved successfully',
        data: {
          maintenance,
          ship: ship ? {
            id: ship.id,
            name: ship.name,
            type: ship.type,
            status: ship.status,
            specifications: ship.specifications
          } : null
        }
      });
    } catch (error) {
      logger.error('Failed to fetch maintenance alert', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch maintenance alert'
      });
    }
  }
);

// PUT /alerts/:id - Update maintenance alert
router.put('/alerts/:id',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Convert scheduledDate to Date if provided
      if (updateData.scheduledDate) {
        updateData.scheduledDate = new Date(updateData.scheduledDate);
      }

      // Convert completedDate to Date if provided
      if (updateData.completedDate) {
        updateData.completedDate = new Date(updateData.completedDate);
      }

      // Convert nextMaintenanceDate to Date if provided
      if (updateData.nextMaintenanceDate) {
        updateData.nextMaintenanceDate = new Date(updateData.nextMaintenanceDate);
      }

      const maintenance = await maintenanceService.update(id, updateData);
      if (!maintenance) {
        return res.status(404).json({
          success: false,
          error: 'Maintenance record not found'
        });
      }

      logger.info('Maintenance alert updated', {
        maintenanceId: id,
        updatedFields: Object.keys(updateData),
      });

      return res.status(200).json({
        success: true,
        message: 'Maintenance alert updated successfully',
        data: { maintenance }
      });
    } catch (error) {
      logger.error('Failed to update maintenance alert', {
        error: error instanceof Error ? error.message : 'Unknown error',
        maintenanceId: req.params.id,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to update maintenance alert'
      });
    }
  }
);

// PUT /alerts/:id/status - Update maintenance status
router.put('/alerts/:id/status',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      if (!status || !['scheduled', 'in_progress', 'completed', 'cancelled', 'overdue'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status. Must be one of: scheduled, in_progress, completed, cancelled, overdue'
        });
      }

      const maintenance = await maintenanceService.updateStatus(id, status, notes);
      if (!maintenance) {
        return res.status(404).json({
          success: false,
          error: 'Maintenance record not found'
        });
      }

      logger.info('Maintenance status updated', {
        maintenanceId: id,
        newStatus: status,
      });

      return res.status(200).json({
        success: true,
        message: 'Maintenance status updated successfully',
        data: { maintenance }
      });
    } catch (error) {
      logger.error('Failed to update maintenance status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        maintenanceId: req.params.id,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to update maintenance status'
      });
    }
  }
);

// GET /overdue - Get overdue maintenance records
router.get('/overdue',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { shipId } = req.query;

      const overdueMaintenances = await maintenanceService.getOverdueMaintenances(shipId as string);

      // Get ship details for each maintenance record
      const maintenanceWithShips = await Promise.all(
        overdueMaintenances.map(async (maintenance) => {
          const ship = await shipService.findById(maintenance.shipId);
          return {
            ...maintenance,
            ship: ship ? {
              id: ship.id,
              name: ship.name,
              type: ship.type,
              status: ship.status
            } : null
          };
        })
      );

      return res.status(200).json({
        success: true,
        message: 'Overdue maintenance records retrieved successfully',
        data: { maintenanceRecords: maintenanceWithShips }
      });
    } catch (error) {
      logger.error('Failed to fetch overdue maintenance records', {
        error: error instanceof Error ? error.message : 'Unknown error',
        shipId: req.query.shipId,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch overdue maintenance records'
      });
    }
  }
);

// GET /upcoming - Get upcoming maintenance records
router.get('/upcoming',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { shipId, days } = req.query;

      const upcomingMaintenances = await maintenanceService.getUpcomingMaintenances(
        shipId as string, 
        days ? parseInt(days as string) : undefined
      );

      // Get ship details for each maintenance record
      const maintenanceWithShips = await Promise.all(
        upcomingMaintenances.map(async (maintenance) => {
          const ship = await shipService.findById(maintenance.shipId);
          return {
            ...maintenance,
            ship: ship ? {
              id: ship.id,
              name: ship.name,
              type: ship.type,
              status: ship.status
            } : null
          };
        })
      );

      return res.status(200).json({
        success: true,
        message: 'Upcoming maintenance records retrieved successfully',
        data: { maintenanceRecords: maintenanceWithShips }
      });
    } catch (error) {
      logger.error('Failed to fetch upcoming maintenance records', {
        error: error instanceof Error ? error.message : 'Unknown error',
        shipId: req.query.shipId,
        days: req.query.days,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch upcoming maintenance records'
      });
    }
  }
);

// GET /analytics/:shipId - Get maintenance analytics
router.get('/analytics/:shipId',
  validateDateRange,
  handleValidationErrors,
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { shipId } = req.params;
      const { startDate, endDate } = req.query;

      const analytics = await maintenanceService.getAnalytics(
        shipId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      return res.status(200).json({
        success: true,
        message: 'Maintenance analytics retrieved successfully',
        data: { analytics }
      });
    } catch (error) {
      logger.error('Failed to fetch maintenance analytics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        shipId: req.params.shipId,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch maintenance analytics'
      });
    }
  }
);

// GET /alerts-summary/:shipId - Generate maintenance alerts for a ship
router.get('/alerts-summary/:shipId',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { shipId } = req.params;

      // Verify ship exists
      const ship = await shipService.findById(shipId);
      if (!ship) {
        return res.status(404).json({
          success: false,
          error: 'Ship not found'
        });
      }

      const alerts = await maintenanceService.generateMaintenanceAlerts(shipId);

      return res.status(200).json({
        success: true,
        message: 'Maintenance alerts generated successfully',
        data: { 
          ship: {
            id: ship.id,
            name: ship.name,
            type: ship.type,
            status: ship.status
          },
          alerts 
        }
      });
    } catch (error) {
      logger.error('Failed to generate maintenance alerts', {
        error: error instanceof Error ? error.message : 'Unknown error',
        shipId: req.params.shipId,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to generate maintenance alerts'
      });
    }
  }
);

// GET /stats/:shipId - Get maintenance statistics for a ship
router.get('/stats/:shipId',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { shipId } = req.params;

      const stats = await maintenanceService.getMaintenanceStats(shipId);

      return res.status(200).json({
        success: true,
        message: 'Maintenance statistics retrieved successfully',
        data: { stats }
      });
    } catch (error) {
      logger.error('Failed to fetch maintenance statistics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        shipId: req.params.shipId,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch maintenance statistics'
      });
    }
  }
);

export default router; 