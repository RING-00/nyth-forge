import { createCrudController } from '@base/controller.base';
import { FieldSelector, parseFieldSelection } from '@base/field-selector.base';
import { createServiceError } from '@base/service.base';
import { StatusCodes } from 'http-status-codes';
import { TemplateModel, type TemplateDocument } from './model.template';
import { TemplateService } from './service.template';

const templateService = TemplateService.getInstance();
const templateFieldSelector = FieldSelector.fromSchema(TemplateModel.schema);
const allowedFields = templateFieldSelector.getAllowedFields();

const allowedFilterFields: (keyof TemplateDocument)[] = [
  'category_id',
  'template_name',
  'template_code',
];

const templateController = createCrudController({
  allowedFilterFields,
  entityName: 'Template',
  routePrefix: '/templates',
  service: templateService,
  additionalRoutes: (controller, { handleRoute, handlePaginatedRoute, fieldSelector }) =>
    controller

      .get('/all', ({ query }) =>
        handleRoute(async () => {
          const templates = await templateService.getAllTemplates();
          const requestedFields = parseFieldSelection(query.fields as string | undefined, allowedFields, 'Template');

          if (fieldSelector && requestedFields.length > 0) {
            const selectionResult = fieldSelector.selectFieldsFromArray(templates, requestedFields);
            return {
              templates: selectionResult.data,
              total: selectionResult.data.length,
            };
          }

          return {
            templates,
            total: templates.length,
          };
        }, 'All templates retrieved successfully'),
      )

      .get('/category/:categoryId', ({ params: { categoryId }, query }) => {
        const pagination = {
          limit: parseInt(query.limit ?? '10', 10),
          page: parseInt(query.page ?? '1', 10),
        };

        return handlePaginatedRoute(
          async () => {
            const templates = await templateService.findByCategoryIdWithPagination(
              categoryId,
              pagination.page,
              pagination.limit,
            );

            if (!templates.data.length) {
              throw createServiceError(
                `No templates found for category ID: ${categoryId}`,
                'NOT_FOUND',
                StatusCodes.NOT_FOUND,
                { categoryId },
              );
            }

            const requestedFields = parseFieldSelection(query.fields as string | undefined, allowedFields, 'Template');

            if (fieldSelector && requestedFields.length > 0) {
              const selectionResult = fieldSelector.selectFieldsFromArray(templates.data, requestedFields);
              return {
                data: selectionResult.data,
                total: templates.total,
              };
            }

            return {
              data: templates.data,
              total: templates.total,
            };
          },
          pagination,
          'Templates by category retrieved successfully',
        );
      })

      .get('/name/:templateName', ({ params: { templateName }, query }) =>
        handleRoute(async () => {
          if (!templateName?.trim()) {
            throw createServiceError('Template name cannot be empty', 'INVALID_INPUT', StatusCodes.BAD_REQUEST, {
              providedTemplateName: templateName,
            });
          }

          const template = await templateService.findByName(templateName);
          if (!template) {
            throw createServiceError(
              `No template found with name: ${templateName}`,
              'NOT_FOUND',
              StatusCodes.NOT_FOUND,
              { templateName },
            );
          }

          const { ResultService } = await import('@modules/result/service.result');
          const resultService = ResultService.getInstance();
          const usageCount = await resultService.countByTemplateId(template._id.toString());

          const requestedFields = parseFieldSelection(query.fields as string | undefined, allowedFields, 'Template');
          let finalTemplateData = template;

          if (fieldSelector && requestedFields.length > 0) {
            const selectionResult = fieldSelector.selectFields(template, requestedFields);
            finalTemplateData = selectionResult.data as TemplateDocument;
          }

          return {
            template: finalTemplateData,
            usageStats: {
              isActive: usageCount > 0,
              usedByResultsCount: usageCount,
            },
          };
        }, 'Template with usage stats retrieved successfully'),
      ),
});

export default templateController;
