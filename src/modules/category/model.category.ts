import { Document, model, Schema, Types } from 'mongoose';

export interface CategoryDocument extends Document {
  _id: Types.ObjectId;
  category_name: string;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<CategoryDocument>(
  {
    category_name: {
      type: String,
      required: [true, 'Category name cannot be empty.'],
      trim: true,
      minlength: [2, 'Category name must be at least 2 characters long.'],
      maxlength: [100, 'Category name cannot exceed 100 characters.'],
    },
  },
  {
    collection: 'categories',
    timestamps: true,
  },
);

categorySchema.index({ category_name: 1 }, { unique: true }).index({ createdAt: -1 });

export const CategoryModel = model<CategoryDocument>('Category', categorySchema);
