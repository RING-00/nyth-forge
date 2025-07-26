import { Document, model, Schema, Types } from 'mongoose';

export interface TemplateDocument extends Document {
  _id: Types.ObjectId;
  category_id: Types.ObjectId;
  template_name: string;
  template_code: string;
  createdAt: Date;
  updatedAt: Date;
}

const templateSchema = new Schema<TemplateDocument>(
  {
    category_id: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category ID cannot be empty.'],
    },
    template_name: {
      type: String,
      required: [true, 'Template name cannot be empty.'],
      trim: true,
      minlength: [1, 'Template name must be at least 1 character long.'],
      maxlength: [100, 'Template name cannot exceed 100 characters.'],
    },
    template_code: {
      type: String,
      required: [true, 'Template code cannot be empty.'],
      trim: true,
      maxlength: [100, 'Template code cannot exceed 500 characters.'],
    },
  },
  {
    collection: 'templates',
    timestamps: true,
  },
);

templateSchema.index({ template_name: 1 }, { unique: true }).index({ category_id: 1, template_name: 1 });

export const TemplateModel = model<TemplateDocument>('Template', templateSchema);
