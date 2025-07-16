# Multi-stage Docker build for Ship Planning API
# Stage 1: Build stage with all dependencies
FROM node:18-slim AS builder

# Install build dependencies needed for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Copy TypeScript configuration
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code and essential files for build
COPY src/ ./src/
COPY database/ ./database/
COPY knexfile.js ./
COPY healthcheck.js ./

# Build the application
RUN npm run build

# Stage 2: Production stage
FROM node:18-slim AS production

# Install runtime dependencies for TensorFlow.js
RUN apt-get update && apt-get install -y \
    dumb-init \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/healthcheck.js ./healthcheck.js

# Copy necessary runtime files
COPY --from=builder /app/database ./database
COPY --from=builder /app/knexfile.js ./knexfile.js

# Create required directories
RUN mkdir -p logs models

# Create non-root user for security
RUN groupadd -r nodejs --gid=1001 && \
    useradd -r -g nodejs --uid=1001 nodejs

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node healthcheck.js

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npm", "start"] 