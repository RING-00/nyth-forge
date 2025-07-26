import { Sorter } from '@types';
import { FilterQuery } from 'mongoose';

interface SortInput {
  sort?: string;
  order?: string;
}

export const buildMongoFilter = <T>(query: Record<string, unknown>, allowedFields: (keyof T)[]): FilterQuery<T> => {
  const filterEntries = Object.entries(query).filter(
    ([key, value]) => allowedFields.includes(key as keyof T) && value != null && value !== '',
  );

  return Object.fromEntries(filterEntries) as FilterQuery<T>;
};

export const getMongoSort = (sorter?: Sorter): Record<string, 1 | -1> | undefined => {
  if (!sorter) {
    return undefined;
  }

  return {
    [sorter.sort]: sorter.order === 'asc' ? 1 : -1,
  };
};

export const parseSorter = (input: unknown): Sorter | undefined => {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const { sort, order } = input as SortInput;

  if (!sort || !order || !isValidSortDirection(order)) {
    return undefined;
  }

  return { sort, order };
};

const isValidSortDirection = (direction: string): direction is 'asc' | 'desc' => {
  return direction === 'asc' || direction === 'desc';
};
