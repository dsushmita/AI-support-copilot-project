import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { Request, Response } from 'express';

interface ErrorResponseBody {
  statusCode: number;
  message: string;
  error: string;
  correlationId: string;
  timestamp: string;
  path: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const isServerError = status >= 500;

    const clientMessage =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    const correlationId =
      (request.headers['x-correlation-id'] as string) ??
      (request as Request & { id?: string }).id ??
      'unknown';

    if (isServerError) {
      this.logger.error(
        {
          err: exception,
          path: request.url,
          method: request.method,
        },
        'Unhandled exception',
      );
    } else {
      this.logger.warn(
        {
          path: request.url,
          method: request.method,
          statusCode: status,
        },
        clientMessage,
      );
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      message: clientMessage,
      error: HttpStatus[status] ?? 'Error',
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(body);
  }
}
