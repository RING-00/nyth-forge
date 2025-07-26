import { createServiceError } from '@base/service.base';
import type { ErrorCode, ServiceError } from '@types';
import { StatusCodes } from 'http-status-codes';
import mongoose, { Error as MongooseError } from 'mongoose';

mongoose.set('strictQuery', false);

const CONNECTION_STATES: Readonly<Record<number, string>> = {
  0: 'Disconnected',
  1: 'Connected',
  2: 'Connecting',
  3: 'Disconnecting',
} as const;

const CONNECTION_CONFIG = {
  options: {
    bufferCommands: false,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  },
} as const;

let eventHandlersAttached = false;

export const connectToDatabase = async (): Promise<void> => {
  setupConnectionEventHandlers();

  const { readyState } = mongoose.connection;

  switch (readyState) {
    case 1:
      console.log('MongoDB is already connected.');
      return;
    case 2:
      console.log('Connection attempt in progress, awaiting completion...');
      await mongoose.connection.asPromise();
      console.log('Successfully connected to MongoDB.');
      return;
  }

  try {
    const mongoUri = validateMongoUri(process.env.MONGODB_URI);
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, CONNECTION_CONFIG.options);
    console.log('Successfully connected to MongoDB.');
    console.log(`Database: ${mongoose.connection.db?.databaseName}`);
  } catch (error) {
    handleConnectionError(error, 'Failed to establish MongoDB connection');
  }
};

export const disconnectFromDatabase = async (): Promise<void> => {
  const { readyState } = mongoose.connection;

  switch (readyState) {
    case 0:
      console.log('MongoDB is already disconnected.');
      return;
    case 3:
      console.log('Disconnection is already in progress.');
      return;
  }

  try {
    console.log('Disconnecting from MongoDB...');
    await mongoose.connection.close();
    console.log('MongoDB connection closed successfully.');
  } catch (error) {
    handleConnectionError(error, 'Failed to disconnect from MongoDB');
  }
};

export const getDatabaseStatus = () => {
  const { readyState, db } = mongoose.connection;

  const hasState = Object.prototype.hasOwnProperty.call(CONNECTION_STATES, readyState);
  const statusDescriptor = hasState ? Object.getOwnPropertyDescriptor(CONNECTION_STATES, readyState) : null;
  const status = statusDescriptor ? statusDescriptor.value : 'Unknown';

  return {
    readyState,
    status,
    isConnected: readyState === 1,
    databaseName: db?.databaseName,
  };
};

const setupConnectionEventHandlers = (): void => {
  if (eventHandlersAttached) {
    return;
  }

  const { connection } = mongoose;
  connection.on('error', (error: MongooseError) => {
    console.error('MongoDB connection error:', error.message);
  });
  connection.on('disconnected', () => {
    console.warn('MongoDB connection lost.');
  });
  connection.on('reconnected', () => {
    console.log('MongoDB reconnected successfully.');
  });
  connection.on('close', () => {
    console.log('MongoDB connection closed.');
  });

  eventHandlersAttached = true;
};

const handleConnectionError = (error: unknown, message: string): never => {
  if (isServiceError(error)) {
    throw error;
  }

  const originalError = error instanceof Error ? error.message : String(error);
  const serviceError = createServiceError(message, 'CONNECTION_ERROR' as ErrorCode, StatusCodes.SERVICE_UNAVAILABLE, {
    originalError,
  });

  console.error(serviceError.message, serviceError.details);
  throw serviceError;
};

const validateMongoUri = (uri: string | undefined): string => {
  if (!uri) {
    throw createServiceError(
      'MongoDB URI is not configured in environment variables.',
      'MISSING_REQUIRED_FIELD' as ErrorCode,
      StatusCodes.INTERNAL_SERVER_ERROR,
      { hint: 'Set the MONGODB_URI environment variable.' },
    );
  }
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    throw createServiceError(
      'Invalid MongoDB URI format.',
      'INVALID_INPUT' as ErrorCode,
      StatusCodes.INTERNAL_SERVER_ERROR,
      { hint: 'URI must start with "mongodb://" or "mongodb+srv://".' },
    );
  }
  return uri;
};

const isServiceError = (error: unknown): error is ServiceError => {
  return typeof error === 'object' && error !== null && 'code' in error;
};
