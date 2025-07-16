// Global type declarations
declare module 'offscreencanvas' {
  export interface OffscreenCanvas extends EventTarget {
    width: number;
    height: number;
    // Add any other properties/methods you need
  }
}

// Extend Express Request type to include custom properties
declare global {
  namespace Express {
    interface Request {
      // user?: {
      //   id: string;
      //   [key: string]: any;
      // }; // Removed - no authentication required
    }
  }
}

// Add any other global type declarations here
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      PORT: string;
      DATABASE_URL: string;
      DB_HOST: string;
      DB_PORT: string;
      DB_NAME: string;
      DB_USER: string;
      DB_PASSWORD: string;
      // JWT_SECRET: string; // Removed - no authentication required
      // JWT_EXPIRE: string; // Removed - no authentication required
      WEATHER_API_KEY: string;
      WEATHER_API_URL: string;
      MODEL_PATH: string;
      ENABLE_MODEL_TRAINING: string;
      RATE_LIMIT_WINDOW_MS: string;
      RATE_LIMIT_MAX_REQUESTS: string;
      CORS_ORIGIN: string;
      LOG_LEVEL: string;
    }
  }
} 