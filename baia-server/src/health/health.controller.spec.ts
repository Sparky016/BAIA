import { Test, TestingModule } from '@nestjs/testing';
import { HealthController, HealthResponse } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('getHealth', () => {
    it('should return { status: "ok" }', () => {
      const expected: HealthResponse = { status: 'ok' };
      expect(controller.getHealth()).toEqual(expected);
    });

    it('should always return the same value', () => {
      const result1 = controller.getHealth();
      const result2 = controller.getHealth();
      expect(result1).toEqual(result2);
    });
  });
});
