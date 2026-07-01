import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { ConfluenceAdapterError } from '../export/confluence.adapter';
import { LlmError } from '../llm/llm.service';
import { IllegalRunTransitionError } from '../runs/run-state-machine';
import { CredentialStoreError } from '../security/credential-store.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, code, message } = this.mapException(exception);

    this.logger.error(
      `[${request.method} ${request.url}] ${statusCode} ${code}: ${message}`,
      exception instanceof Error ? exception.stack : String(exception)
    );

    response.status(statusCode).json({ statusCode, code, message });
  }

  private mapException(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
  } {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : typeof res === 'object' && res !== null && 'message' in res
            ? String((res as Record<string, unknown>)['message'])
            : exception.message;
      return { statusCode: exception.getStatus(), code: 'HTTP_ERROR', message };
    }

    if (exception instanceof IllegalRunTransitionError) {
      return {
        statusCode: HttpStatus.CONFLICT,
        code: 'ILLEGAL_TRANSITION',
        message: exception.message,
      };
    }

    if (exception instanceof LlmError) {
      return {
        statusCode: HttpStatus.BAD_GATEWAY,
        code: exception.code,
        message: `LLM service error: ${exception.code}`,
      };
    }

    if (exception instanceof ConfluenceAdapterError) {
      return {
        statusCode: HttpStatus.BAD_GATEWAY,
        code: exception.code,
        message: `Confluence error: ${exception.code}`,
      };
    }

    if (exception instanceof CredentialStoreError) {
      const statusCode =
        exception.code === 'NOT_FOUND' || exception.code === 'MISSING_KEY'
          ? HttpStatus.UNAUTHORIZED
          : HttpStatus.BAD_REQUEST;
      return {
        statusCode,
        code: exception.code,
        message: `Credential error: ${exception.code}`,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    };
  }
}
