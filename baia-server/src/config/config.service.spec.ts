import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { ConfigService } from './config.service';

describe('ConfigService', () => {
  let service: ConfigService;
  let nestConfigService: jest.Mocked<NestConfigService>;

  beforeEach(async () => {
    const mockGet = jest.fn(<T>(key: string, defaultValue?: T): T => {
      const config: Record<string, unknown> = {
        PORT: 3000,
        CORS_ORIGIN: 'http://localhost:4200',
        NODE_ENV: 'development',
      };
      return (config[key] ?? defaultValue) as T;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigService,
        {
          provide: NestConfigService,
          useValue: { get: mockGet },
        },
      ],
    }).compile();

    nestConfigService = module.get(NestConfigService);
    service = module.get<ConfigService>(ConfigService);
  });

  describe('port', () => {
    it('should return default port 3000', () => {
      expect(service.port).toBe(3000);
    });
  });

  describe('corsOrigin', () => {
    it('should return default cors origin', () => {
      expect(service.corsOrigin).toBe('http://localhost:4200');
    });
  });

  describe('isDevelopment', () => {
    it('should return true when NODE_ENV is development', () => {
      expect(service.isDevelopment()).toBe(true);
    });
  });

  describe('copilotApiKey', () => {
    it('should return undefined when COPILOT_API_KEY is not set', () => {
      expect(service.copilotApiKey).toBeUndefined();
    });
  });

  describe('copilotApiUrl', () => {
    it('should return undefined when COPILOT_API_URL is not set', () => {
      expect(service.copilotApiUrl).toBeUndefined();
    });
  });

  describe('nodeEnv', () => {
    it('should return development as the node environment', () => {
      expect(service.nodeEnv).toBe('development');
    });
  });

  describe('isProduction', () => {
    it('should return false when NODE_ENV is development', () => {
      expect(service.isProduction()).toBe(false);
    });
  });
});
