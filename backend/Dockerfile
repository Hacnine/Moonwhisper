# Backend Dockerfile for Monorepo (TypeScript + Prisma)
FROM node:24-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Install system utilities required by healthchecks and Prisma
RUN apt-get update \
	&& apt-get install -y --no-install-recommends wget openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml .pnpmrc* ./
COPY backend/package.json ./backend/

# Install dependencies for backend workspace only
RUN pnpm install --frozen-lockfile --filter moonwhishperprojectbackend

# Copy backend source code
COPY backend/ ./backend/

# Set working directory to backend
WORKDIR /app/backend

# Provide DATABASE_URL for build-time Prisma commands only (ARG = build-time, not runtime)
ARG DATABASE_URL="postgresql://moonwhisper:moonwhisper@localhost:5432/moonwhisper"

# Generate Prisma client
RUN npx prisma generate

# Create uploads directory with proper permissions
RUN mkdir -p /app/backend/uploads && chmod 755 /app/backend/uploads

# Copy and prepare entrypoint script
COPY backend/docker-entrypoint.sh /app/backend/docker-entrypoint.sh
RUN chmod +x /app/backend/docker-entrypoint.sh

EXPOSE 3001

# Run pending migrations then start app
CMD ["sh", "/app/backend/docker-entrypoint.sh"]