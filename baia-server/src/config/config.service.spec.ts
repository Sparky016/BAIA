import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { ConfigService } from './config.service';

describe('ConfigService', () => {
  let service: ConfigService;
  let nestConfigService: NestConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: NestConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: any) => {
              const config: Record<string, any> = {
                PORT: 3000,
                CORS_ORIGIN: 'http://localhost:4200',
                NODE_ENV: 'development',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    nestConfigService = module.get<NestConfigService>(NestConfigService);
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

  describe('isProduction', () => {
    it('should return false when NODE_ENV is development', () => {
      expect(service.isProduction()).toBe(false);
    });
  });
});
