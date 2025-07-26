import { PaginationInput, PaginationResult } from '@types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MIN_PAGE = 1;
const MAX_LIMIT = 100;

export const createPaginationResult = (input: PaginationInput, totalItems: number): PaginationResult => {
  const { page, limit } = getNormalizedPagination(input);
  const totalPages = Math.ceil(totalItems / limit);

  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

export const validatePaginationInput = (
  input: PaginationInput,
): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  const { page, limit } = getNormalizedPagination(input);

  if (!Number.isInteger(page) || page < MIN_PAGE) {
    errors.push(`Page must be an integer greater than or equal to ${MIN_PAGE}.`);
  }

  if (!Number.isInteger(limit) || limit < 1) {
    errors.push('Limit must be an integer greater than or equal to 1.');
  }

  if (limit > MAX_LIMIT) {
    errors.push(`Limit cannot be greater than ${MAX_LIMIT}.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const getNormalizedPagination = (input: PaginationInput): Required<PaginationInput> => {
  return {
    page: input.page ?? DEFAULT_PAGE,
    limit: input.limit ?? DEFAULT_LIMIT,
  };
};
