import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: string;
}

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }
}
