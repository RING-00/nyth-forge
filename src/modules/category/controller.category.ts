import { createCrudController } from '@base/controller.base';
import { FieldSelector, parseFieldSelection } from '@base/field-selector.base';
import { createServiceError } from '@base/service.base';
import { StatusCodes } from 'http-status-codes';
import { CategoryModel, type CategoryDocument } from './model.category';
import { CategoryService } from './service.category';

const categoryService = CategoryService.getInstance();
const categoryFieldSelector = FieldSelector.fromSchema(CategoryModel.schema);
const allowedFields = categoryFieldSelector.getAllowedFields();

const allowedFilterFields: (keyof CategoryDocument)[] = [
  'category_name',
];

const categoryController = createCrudController({
  allowedFilterFields,
  entityName: 'Category',
  routePrefix: '/categories',
  service: categoryService,
  additionalRoutes: (controller, { handleRoute, handlePaginatedRoute, fieldSelector }) =>
    controller

      .get('/all', ({ query }) =>
        handleRoute(async () => {
          const categories = await categoryService.getAllCategories();
          const requestedFields = parseFieldSelection(query.fields as string | undefined, allowedFields, 'Category');

          if (fieldSelector && requestedFields.length > 0) {
            const selectionResult = fieldSelector.selectFieldsFromArray(categories, requestedFields);
            return {
              categories: selectionResult.data,
              total: selectionResult.data.length,
            };
          }

          return {
            categories,
            total: categories.length,
          };
        }, 'All categories retrieved successfully'),
      )

      .get('/name/:categoryName', ({ params: { categoryName }, query }) => {
        const pagination = {
          limit: parseInt(query.limit ?? '10', 10),
          page: parseInt(query.page ?? '1', 10),
        };

        return handlePaginatedRoute(
          async () => {
            if (!categoryName?.trim()) {
              throw createServiceError('Category name cannot be empty', 'INVALID_INPUT', StatusCodes.BAD_REQUEST, {
                providedCategoryName: categoryName,
              });
            }

            const category = await categoryService.findByName(categoryName);
            if (!category) {
              throw createServiceError(
                `No category found with name: ${categoryName}`,
                'NOT_FOUND',
                StatusCodes.NOT_FOUND,
                { categoryName },
              );
            }

            const { TemplateService } = await import('@modules/template/service.template');
            const templateService = TemplateService.getInstance();
            const templatesResult = await templateService.findByCategoryIdWithPagination(
              category._id.toString(),
              pagination.page,
              pagination.limit,
            );

            const requestedFields = parseFieldSelection(query.fields as string | undefined, allowedFields, 'Category');
            let finalCategoryData = category;

            if (fieldSelector && requestedFields.length > 0) {
              const selectionResult = fieldSelector.selectFields(category, requestedFields);
              finalCategoryData = selectionResult.data as CategoryDocument;
            }

            return {
              data: [
                {
                  category: finalCategoryData,
                  templates: templatesResult.data,
                },
              ],
              total: templatesResult.total,
            };
          },
          pagination,
          'Category with templates retrieved successfully',
        );
      }),
});

export default categoryController;
