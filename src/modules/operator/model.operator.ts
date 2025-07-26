import { DEFAULT_STATS, type OperatorStats } from '@utils';
import { Document, model, Schema, Types } from 'mongoose';

export interface OperatorDocument extends Document {
  _id: Types.ObjectId;
  operator_name: string;
  stats: OperatorStats;
  createdAt: Date;
  updatedAt: Date;
}

const statsSchema = new Schema<OperatorStats>(
  {
    total_test_sessions: { type: Number, default: DEFAULT_STATS.total_test_sessions },
    total_passed_tests: { type: Number, default: DEFAULT_STATS.total_passed_tests },
    total_failed_tests: { type: Number, default: DEFAULT_STATS.total_failed_tests },
    average_pass_rate: { type: Number, default: DEFAULT_STATS.average_pass_rate },
    average_duration: { type: String, default: DEFAULT_STATS.average_duration },
    first_test_date: { type: Date, default: DEFAULT_STATS.first_test_date },
    last_test_date: { type: Date, default: DEFAULT_STATS.last_test_date },
    first_test_id: { type: String, default: DEFAULT_STATS.first_test_id },
    last_test_id: { type: String, default: DEFAULT_STATS.last_test_id },
  },
  { _id: false },
);

const operatorSchema = new Schema<OperatorDocument>(
  {
    operator_name: {
      type: String,
      required: [true, 'Operator name cannot be empty.'],
      trim: true,
    },
    stats: {
      type: statsSchema,
      default: () => ({ ...DEFAULT_STATS }),
    },
  },
  {
    collection: 'operators',
    timestamps: true,
  },
);

operatorSchema
  .index({ operator_name: 1 }, { unique: true })
  .index({ 'stats.total_test_sessions': -1 })
  .index({ 'stats.average_pass_rate': -1 })
  .index({ 'stats.last_test_date': -1 })
  .index({ createdAt: -1 });

export const OperatorModel = model<OperatorDocument>('Operator', operatorSchema);
