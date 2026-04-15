import { Server, Socket } from 'socket.io';
import logger from '../utils/logger.js';

export interface IGateway {
  handleConnection(socket: Socket): void;
  handleDisconnect?(socket: Socket, reason: string): void;
}

export class GatewayManager {
  private io: Server;
  private gateways: IGateway[] = [];

  constructor(io: Server) {
    this.io = io;
  }

  register(Gateway: new (io: Server) => IGateway): IGateway {
    const gateway = new Gateway(this.io);
    this.gateways.push(gateway);
    return gateway;
  }

  initialize(): void {
    logger.info(`Initializing ${this.gateways.length} socket gateways...`);

    this.io.on('connection', (socket: Socket) => {
      logger.info({ id: socket.id, userId: (socket as any).user?.id }, 'Socket connected');

      this.gateways.forEach((gateway) => {
        if (typeof gateway.handleConnection === 'function') {
          gateway.handleConnection(socket);
        }
      });

      socket.on('disconnect', (reason) => {
        logger.info({ id: socket.id, userId: (socket as any).user?.id, reason }, 'Socket disconnected');
        this.gateways.forEach((gateway) => {
          if (typeof gateway.handleDisconnect === 'function') {
            gateway.handleDisconnect(socket, reason);
          }
        });
      });
    });

    logger.info('All socket gateways initialized');
  }

  getGateway(name: string): IGateway | undefined {
    return this.gateways.find((g) => g.constructor.name === name);
  }
}
