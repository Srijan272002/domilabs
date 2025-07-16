import axios from 'axios';
import { logger } from '../utils/logger';

interface WeatherApiResponse {
  current: {
    temp_c: number;
    humidity: number;
    wind_kph: number;
    wind_degree: number;
    vis_km: number;
    pressure_mb: number;
    uv: number;
    cloud: number;
    precip_mm: number;
  };
}

export interface WeatherCondition {
  latitude: number;
  longitude: number;
  timestamp: Date;
  temperature: number; // Celsius
  humidity: number; // Percentage
  windSpeed: number; // km/h
  windDirection: number; // Degrees
  visibility: number; // km
  pressure: number; // hPa
  uvIndex: number;
  cloudCover: number; // Percentage
  precipitation: number; // mm
  seaState?: {
    waveHeight: number; // meters
    swellHeight: number; // meters
    swellDirection: number; // degrees
    seaTemperature: number; // Celsius
  };
  warnings?: string[];
}

export interface WeatherForecast {
  location: {
    latitude: number;
    longitude: number;
  };
  current: WeatherCondition;
  hourly: WeatherCondition[];
  daily: Array<{
    date: Date;
    maxTemp: number;
    minTemp: number;
    avgWindSpeed: number;
    maxWindSpeed: number;
    precipitation: number;
    description: string;
    seaState?: {
      maxWaveHeight: number;
      avgWaveHeight: number;
    };
  }>;
}

export interface RouteWeatherAnalysis {
  routeSegments: Array<{
    startPoint: { latitude: number; longitude: number };
    endPoint: { latitude: number; longitude: number };
    weatherConditions: WeatherCondition[];
    riskLevel: 'low' | 'medium' | 'high' | 'extreme';
    recommendations: string[];
  }>;
  overallRisk: 'low' | 'medium' | 'high' | 'extreme';
  bestTimeWindow?: {
    start: Date;
    end: Date;
    reason: string;
  };
  alerts: Array<{
    type: 'storm' | 'high_waves' | 'low_visibility' | 'strong_winds';
    severity: 'warning' | 'watch' | 'advisory';
    area: { latitude: number; longitude: number; radius: number };
    validFrom: Date;
    validTo: Date;
    description: string;
  }>;
}

export class WeatherService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.WEATHER_API_KEY || '';
    this.baseUrl = process.env.WEATHER_API_URL || 'http://api.weatherapi.com/v1';
    
    if (!this.apiKey) {
      logger.warn('Weather API key not configured. Using mock weather data.');
    }
  }

  private async makeApiRequest<T>(endpoint: string, params: any): Promise<T | null> {
    if (!this.apiKey) {
      logger.debug('No API key available, using mock data');
      return null;
    }

    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        params: {
          key: this.apiKey,
          ...params
        },
        timeout: 15000,
        validateStatus: (status) => status === 200
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        logger.error('Weather API authentication failed. Check API key configuration.', {
          endpoint,
          error: 'Invalid API key'
        });
        this.apiKey = ''; // Clear invalid API key
        return null;
      }

      logger.error('Weather API request failed', {
        endpoint,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  async getCurrentWeather(latitude: number, longitude: number): Promise<WeatherCondition | null> {
    const data = await this.makeApiRequest<WeatherApiResponse>('/current.json', {
      q: `${latitude},${longitude}`,
      aqi: 'yes'
    });

    if (!data) {
      return this.getMockWeatherCondition(latitude, longitude);
    }

    const weatherCondition: WeatherCondition = {
      latitude,
      longitude,
      timestamp: new Date(),
      temperature: data.current.temp_c,
      humidity: data.current.humidity,
      windSpeed: data.current.wind_kph,
      windDirection: data.current.wind_degree,
      visibility: data.current.vis_km,
      pressure: data.current.pressure_mb,
      uvIndex: data.current.uv,
      cloudCover: data.current.cloud,
      precipitation: data.current.precip_mm,
      seaState: this.estimateSeaState(data.current.wind_kph, data.current.wind_degree),
      warnings: this.generateWeatherWarnings(data.current)
    };

      logger.info('Weather data retrieved successfully', {
        latitude,
        longitude,
        temperature: weatherCondition.temperature,
        windSpeed: weatherCondition.windSpeed
      });

      return weatherCondition;
  }

  async getForecast(latitude: number, longitude: number, days = 7): Promise<WeatherForecast | null> {
    try {
      if (!this.apiKey) {
        return this.getMockWeatherForecast(latitude, longitude, days);
      }

      const response = await axios.get(`${this.baseUrl}/forecast.json`, {
        params: {
          key: this.apiKey,
          q: `${latitude},${longitude}`,
          days: Math.min(days, 10), // API limit
          aqi: 'yes',
          alerts: 'yes'
        },
        timeout: 15000
      });

      const data = response.data;
      
      const forecast: WeatherForecast = {
        location: { latitude, longitude },
        current: await this.getCurrentWeather(latitude, longitude) || this.getMockWeatherCondition(latitude, longitude),
        hourly: this.parseHourlyForecast(data.forecast.forecastday),
        daily: this.parseDailyForecast(data.forecast.forecastday)
      };

      logger.info('Weather forecast retrieved successfully', {
        latitude,
        longitude,
        days,
        hourlyDataPoints: forecast.hourly.length,
        dailyDataPoints: forecast.daily.length
      });

      return forecast;
    } catch (error) {
      logger.error('Failed to fetch weather forecast', {
        error: error instanceof Error ? error.message : 'Unknown error',
        latitude,
        longitude,
        days
      });
      
      // Return mock data as fallback
      return this.getMockWeatherForecast(latitude, longitude, days);
    }
  }

  async analyzeRouteWeather(waypoints: Array<{ latitude: number; longitude: number; estimatedArrival?: Date }>): Promise<RouteWeatherAnalysis> {
    try {
      const routeSegments: RouteWeatherAnalysis['routeSegments'] = [];
      const alerts: RouteWeatherAnalysis['alerts'] = [];
      let overallRisk: RouteWeatherAnalysis['overallRisk'] = 'low';

      for (let i = 0; i < waypoints.length - 1; i++) {
        const startPoint = waypoints[i];
        const endPoint = waypoints[i + 1];
        
        // Get weather forecast for both points
        const startWeather = await this.getForecast(startPoint.latitude, startPoint.longitude, 3);
        const endWeather = await this.getForecast(endPoint.latitude, endPoint.longitude, 3);
        
        // Interpolate weather conditions along the route segment
        const weatherConditions: WeatherCondition[] = [];
        if (startWeather && endWeather) {
          weatherConditions.push(startWeather.current);
          weatherConditions.push(...startWeather.hourly.slice(0, 12)); // Next 12 hours
          weatherConditions.push(endWeather.current);
        }

        // Analyze risk level for this segment
        const riskLevel = this.calculateSegmentRiskLevel(weatherConditions);
        if (this.getRiskValue(riskLevel) > this.getRiskValue(overallRisk)) {
          overallRisk = riskLevel;
        }

        // Generate recommendations
        const recommendations = this.generateRouteRecommendations(weatherConditions, riskLevel);

        routeSegments.push({
          startPoint,
          endPoint,
          weatherConditions,
          riskLevel,
          recommendations
        });

        // Check for weather alerts
        const segmentAlerts = this.generateWeatherAlerts(startPoint, endPoint, weatherConditions);
        alerts.push(...segmentAlerts);
      }

      // Find best time window
      const bestTimeWindow = this.findBestTimeWindow(routeSegments);

      const analysis: RouteWeatherAnalysis = {
        routeSegments,
        overallRisk,
        bestTimeWindow,
        alerts
      };

      logger.info('Route weather analysis completed', {
        segmentCount: routeSegments.length,
        overallRisk,
        alertCount: alerts.length,
        hasBestTimeWindow: !!bestTimeWindow
      });

      return analysis;
    } catch (error) {
      logger.error('Failed to analyze route weather', {
        error: error instanceof Error ? error.message : 'Unknown error',
        waypointCount: waypoints.length
      });
      
      // Return basic analysis as fallback
      return {
        routeSegments: [],
        overallRisk: 'medium',
        alerts: []
      };
    }
  }

  private getMockWeatherCondition(latitude: number, longitude: number): WeatherCondition {
    // Generate realistic mock weather data based on location and time
    const now = new Date();
    const season = Math.floor((now.getMonth() + 1) / 3);
    
    return {
      latitude,
      longitude,
      timestamp: now,
      temperature: 15 + (season * 5) + (Math.random() * 10),
      humidity: 60 + (Math.random() * 30),
      windSpeed: 10 + (Math.random() * 20),
      windDirection: Math.random() * 360,
      visibility: 8 + (Math.random() * 7),
      pressure: 1013 + (Math.random() * 40 - 20),
      uvIndex: Math.max(0, Math.min(11, season * 2 + Math.random() * 4)),
      cloudCover: Math.random() * 100,
      precipitation: Math.random() * 5,
      seaState: {
        waveHeight: 1 + (Math.random() * 3),
        swellHeight: 0.5 + (Math.random() * 2),
        swellDirection: Math.random() * 360,
        seaTemperature: 12 + (season * 6) + (Math.random() * 8)
      },
      warnings: []
    };
  }

  private getMockWeatherForecast(latitude: number, longitude: number, days: number): WeatherForecast {
    const current = this.getMockWeatherCondition(latitude, longitude);
    const hourly: WeatherCondition[] = [];
    const daily: WeatherForecast['daily'] = [];

    // Generate hourly forecast
    for (let i = 1; i <= 24 * days; i++) {
      const futureTime = new Date(Date.now() + (i * 60 * 60 * 1000));
      hourly.push({
        ...current,
        timestamp: futureTime,
        temperature: current.temperature + (Math.random() * 6 - 3),
        windSpeed: current.windSpeed + (Math.random() * 10 - 5),
        precipitation: Math.random() * 3
      });
    }

    // Generate daily forecast
    for (let i = 0; i < days; i++) {
      const futureDate = new Date(Date.now() + (i * 24 * 60 * 60 * 1000));
      daily.push({
        date: futureDate,
        maxTemp: current.temperature + (Math.random() * 8),
        minTemp: current.temperature - (Math.random() * 8),
        avgWindSpeed: current.windSpeed,
        maxWindSpeed: current.windSpeed + (Math.random() * 15),
        precipitation: Math.random() * 5,
        description: 'Partly cloudy',
        seaState: {
          maxWaveHeight: 2 + (Math.random() * 4),
          avgWaveHeight: 1 + (Math.random() * 2)
        }
      });
    }

    return {
      location: { latitude, longitude },
      current,
      hourly,
      daily
    };
  }

  private parseHourlyForecast(forecastDays: any[]): WeatherCondition[] {
    const hourly: WeatherCondition[] = [];
    
    for (const day of forecastDays) {
      for (const hour of day.hour) {
        hourly.push({
          latitude: 0, // Will be set by caller
          longitude: 0, // Will be set by caller
          timestamp: new Date(hour.time),
          temperature: hour.temp_c,
          humidity: hour.humidity,
          windSpeed: hour.wind_kph,
          windDirection: hour.wind_degree,
          visibility: hour.vis_km,
          pressure: hour.pressure_mb,
          uvIndex: hour.uv,
          cloudCover: hour.cloud,
          precipitation: hour.precip_mm,
          seaState: this.estimateSeaState(hour.wind_kph, hour.wind_degree),
          warnings: this.generateWeatherWarnings(hour)
        });
      }
    }
    
    return hourly;
  }

  private parseDailyForecast(forecastDays: any[]): WeatherForecast['daily'] {
    return forecastDays.map(day => ({
      date: new Date(day.date),
      maxTemp: day.day.maxtemp_c,
      minTemp: day.day.mintemp_c,
      avgWindSpeed: day.day.avgvis_km,
      maxWindSpeed: day.day.maxwind_kph,
      precipitation: day.day.totalprecip_mm,
      description: day.day.condition.text,
      seaState: {
        maxWaveHeight: this.estimateWaveHeight(day.day.maxwind_kph),
        avgWaveHeight: this.estimateWaveHeight(day.day.avgvis_km)
      }
    }));
  }

  private estimateSeaState(windSpeed: number, windDirection: number) {
    const waveHeight = this.estimateWaveHeight(windSpeed);
    return {
      waveHeight,
      swellHeight: waveHeight * 0.7,
      swellDirection: windDirection + (Math.random() * 60 - 30),
      seaTemperature: 15 + (Math.random() * 10)
    };
  }

  private estimateWaveHeight(windSpeed: number): number {
    // Simplified wave height estimation based on wind speed
    if (windSpeed < 10) return 0.5 + (windSpeed * 0.1);
    if (windSpeed < 20) return 1 + ((windSpeed - 10) * 0.15);
    if (windSpeed < 30) return 2.5 + ((windSpeed - 20) * 0.2);
    return 4.5 + ((windSpeed - 30) * 0.25);
  }

  private generateWeatherWarnings(weatherData: any): string[] {
    const warnings: string[] = [];
    
    if (weatherData.wind_kph > 40) {
      warnings.push('Strong winds detected');
    }
    
    if (weatherData.vis_km < 2) {
      warnings.push('Low visibility conditions');
    }
    
    if (weatherData.precip_mm > 10) {
      warnings.push('Heavy precipitation');
    }
    
    return warnings;
  }

  private calculateSegmentRiskLevel(conditions: WeatherCondition[]): 'low' | 'medium' | 'high' | 'extreme' {
    let maxRisk = 0;
    
    for (const condition of conditions) {
      let risk = 0;
      
      // Wind speed risk
      if (condition.windSpeed > 50) risk += 4;
      else if (condition.windSpeed > 35) risk += 3;
      else if (condition.windSpeed > 25) risk += 2;
      else if (condition.windSpeed > 15) risk += 1;
      
      // Wave height risk
      if (condition.seaState?.waveHeight && condition.seaState.waveHeight > 6) risk += 4;
      else if (condition.seaState?.waveHeight && condition.seaState.waveHeight > 4) risk += 3;
      else if (condition.seaState?.waveHeight && condition.seaState.waveHeight > 2) risk += 2;
      
      // Visibility risk
      if (condition.visibility < 1) risk += 3;
      else if (condition.visibility < 3) risk += 2;
      else if (condition.visibility < 5) risk += 1;
      
      // Precipitation risk
      if (condition.precipitation > 20) risk += 3;
      else if (condition.precipitation > 10) risk += 2;
      else if (condition.precipitation > 5) risk += 1;
      
      maxRisk = Math.max(maxRisk, risk);
    }
    
    if (maxRisk >= 8) return 'extreme';
    if (maxRisk >= 6) return 'high';
    if (maxRisk >= 3) return 'medium';
    return 'low';
  }

  private getRiskValue(risk: string): number {
    switch (risk) {
      case 'extreme': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }

  private generateRouteRecommendations(conditions: WeatherCondition[], riskLevel: string): string[] {
    const recommendations: string[] = [];
    
    if (riskLevel === 'extreme') {
      recommendations.push('Consider delaying departure');
      recommendations.push('Seek alternative route');
    } else if (riskLevel === 'high') {
      recommendations.push('Proceed with extreme caution');
      recommendations.push('Monitor weather conditions closely');
    }
    
    const avgWindSpeed = conditions.reduce((sum, c) => sum + c.windSpeed, 0) / conditions.length;
    if (avgWindSpeed > 30) {
      recommendations.push('Reduce speed for safety');
    }
    
    const avgVisibility = conditions.reduce((sum, c) => sum + c.visibility, 0) / conditions.length;
    if (avgVisibility < 3) {
      recommendations.push('Use fog signals and radar');
    }
    
    return recommendations;
  }

  private generateWeatherAlerts(
    startPoint: { latitude: number; longitude: number },
    endPoint: { latitude: number; longitude: number },
    conditions: WeatherCondition[]
  ): RouteWeatherAnalysis['alerts'] {
    const alerts: RouteWeatherAnalysis['alerts'] = [];
    
    // Check for storm conditions
    const hasStorm = conditions.some(c => c.windSpeed > 40 && c.precipitation > 10);
    if (hasStorm) {
      alerts.push({
        type: 'storm',
        severity: 'warning',
        area: {
          latitude: (startPoint.latitude + endPoint.latitude) / 2,
          longitude: (startPoint.longitude + endPoint.longitude) / 2,
          radius: 50
        },
        validFrom: new Date(),
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
        description: 'Storm conditions with high winds and heavy precipitation'
      });
    }
    
    return alerts;
  }

  private findBestTimeWindow(segments: RouteWeatherAnalysis['routeSegments']): RouteWeatherAnalysis['bestTimeWindow'] | undefined {
    // Simplified logic to find the best time window
    const lowRiskSegments = segments.filter(s => s.riskLevel === 'low');
    
    if (lowRiskSegments.length > segments.length * 0.7) {
      return {
        start: new Date(),
        end: new Date(Date.now() + 24 * 60 * 60 * 1000),
        reason: 'Current conditions are favorable for the entire route'
      };
    }
    
    return undefined;
  }
}

export const weatherService = new WeatherService(); 