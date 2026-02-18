import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    if (process.env.NODE_ENV === 'development') {
      this.logger.error(`Exception: ${exception}`, (exception as any)?.stack);
    }

    response
      .status(status)
      .json(new ApiResponse(status, message, undefined, request.url));
  }
}

// dto/response.dto.ts
export class ApiResponse<T> {
  statusCode: number;
  message: string;
  data?: T;
  timestamp: string;
  path?: string;

  constructor(statusCode: number, message: string, data?: T, path?: string) {
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.path = path;
    this.timestamp = new Date().toISOString();
  }
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
