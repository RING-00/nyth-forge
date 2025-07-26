import { createCrudController } from '@base/controller.base';
import { FieldSelector, parseFieldSelection } from '@base/field-selector.base';
import { createServiceError } from '@base/service.base';
import { StatusCodes } from 'http-status-codes';
import { ResultModel, type ResultDocument } from './model.result';
import { ResultService } from './service.result';

const resultService = ResultService.getInstance();
const resultFieldSelector = FieldSelector.fromSchema(ResultModel.schema);
const allowedFields = resultFieldSelector.getAllowedFields();

const allowedFilterFields: (keyof ResultDocument)[] = [
  'operator_id',
  'template_id',
  'serial_number',
  'product',
];

const resultController = createCrudController({
  allowedFilterFields,
  entityName: 'Result',
  routePrefix: '/results',
  service: resultService,
  additionalRoutes: (controller, { handleRoute, handlePaginatedRoute, fieldSelector }) =>
    controller

      .get('/operator/:operatorId', ({ params: { operatorId }, query }) => {
        const pagination = {
          limit: parseInt(query.limit ?? '10', 10),
          page: parseInt(query.page ?? '1', 10),
        };

        return handlePaginatedRoute(
          async () => {
            const results = await resultService.findByOperatorIdWithPagination(
              operatorId,
              pagination.page,
              pagination.limit,
            );

            if (!results.data.length) {
              throw createServiceError(
                `No test results found for operator ID: ${operatorId}`,
                'NOT_FOUND',
                StatusCodes.NOT_FOUND,
                { operatorId },
              );
            }

            const requestedFields = parseFieldSelection(query.fields as string | undefined, allowedFields, 'Result');

            if (fieldSelector && requestedFields.length > 0) {
              const selectionResult = fieldSelector.selectFieldsFromArray(results.data, requestedFields);
              return {
                data: selectionResult.data,
                total: results.total,
              };
            }

            return {
              data: results.data,
              total: results.total,
            };
          },
          pagination,
          'Test results by operator retrieved successfully',
        );
      })

      .get('/serial/:serialNumber', ({ params: { serialNumber }, query }) =>
        handleRoute(async () => {
          const result = await resultService.findBySerialNumber(serialNumber);

          if (!result) {
            throw createServiceError(
              `No test result found for serial number: ${serialNumber}`,
              'NOT_FOUND',
              StatusCodes.NOT_FOUND,
              { serialNumber },
            );
          }

          const requestedFields = parseFieldSelection(query.fields as string | undefined, allowedFields, 'Result');

          if (fieldSelector && requestedFields.length > 0) {
            const selectionResult = fieldSelector.selectFields(result, requestedFields);
            return selectionResult.data;
          }

          return result;
        }, 'Test result by serial number retrieved successfully'),
      ),
});

export default resultController;
