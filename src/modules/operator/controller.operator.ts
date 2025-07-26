import { createCrudController } from '@base/controller.base';
import type { OperatorDocument } from './model.operator';
import { OperatorService } from './service.operator';

const operatorService = OperatorService.getInstance();

const allowedFilterFields: (keyof OperatorDocument)[] = [
  'operator_name',
];

const operatorController = createCrudController({
  allowedFilterFields,
  entityName: 'Operator',
  routePrefix: '/operators',
  service: operatorService,
  additionalRoutes: (controller, { handleRoute }) =>
    controller

      .post('/:id/calculate-stats', ({ params: { id } }) =>
        handleRoute(async () => {
          const operator = await operatorService.updateOperatorStats(id);
          return {
            operationStatus: 'completed',
            operator,
          };
        }, 'Operator statistics updated successfully'),
      )

      .post('/recalculate-all-stats', () =>
        handleRoute(async () => {
          const { operators, updated_operators } = await operatorService.recalculateAllOperatorStats();
          const totalOperators = operators.length;

          return {
            operators,
            summary: {
              failedUpdates: totalOperators - updated_operators,
              successfulUpdates: updated_operators,
              totalOperators,
            },
          };
        }, 'All operator statistics recalculated successfully'),
      ),
});

export default operatorController;
