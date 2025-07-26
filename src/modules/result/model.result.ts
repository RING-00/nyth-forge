import { Document, model, Schema, Types } from 'mongoose';

export interface Audio {
  manufacturer: string;
  name: string;
}

export interface Battery {
  is_desktop: boolean;
  percent: number;
  power_plugged: boolean;
}

export interface CPU {
  clock_speed: number;
  cores: number;
  name: string;
  threads: number;
}

export interface GPU {
  name: string;
  shared_memory: number;
  type: string;
  vram: number;
}

export interface RamSlot {
  capacity: number;
  configured_speed: number;
  location: string;
  manufacturer: string;
  speed: number;
}

export interface Memory {
  available: number;
  ram_slots: RamSlot[];
  total: number;
  usage_percent: number;
  used: number;
}

export interface Monitor {
  aspect_ratio: string;
  current_resolution: string;
  device_id: string;
  height: number;
  is_primary: boolean;
  manufacturer: string;
  native_resolution: string;
  physical_height_mm: number;
  physical_width_mm: number;
  refresh_rate: number;
  screen_size: string;
  width: number;
}

export interface Motherboard {
  bios_serial: string;
  bios_version: string;
  manufacturer: string;
  product: string;
  serial_number: string;
  system_sku: string;
}

export interface NetworkDevice {
  ip_address: string;
  mac_address: string;
  name: string;
  status: string;
}

export interface Network {
  ethernet: NetworkDevice[];
  wifi: NetworkDevice[];
}

export interface Storage {
  drive: string;
  free_space: number;
  interface: string;
  model: string;
  total_size: number;
  type: string;
  used_space: number;
}

export interface Specification {
  audio: Audio[];
  battery: Battery;
  cpu: CPU[];
  gpu: GPU[];
  memory: Memory;
  monitors: Monitor[];
  motherboard: Motherboard;
  network: Network;
  storage: Storage[];
}

export interface Test {
  status: string;
  timestamp: string;
  type: string;
}

export interface TestResult {
  name: string;
  test_id: number;
  status?: string;
  timestamp?: string;
  total_keys?: number;
  port_count?: number;
  target?: string;
  tests?: Test[];
  [key: string]: unknown;
}

export interface Summary {
  completed_at: string;
  duration: string;
  failed: number;
  pass_rate: number;
  passed: number;
  results: TestResult[];
  test_date: string;
  total: number;
}

const ramSlotSchema = new Schema<RamSlot>(
  {
    capacity: { type: Number, required: true },
    configured_speed: { type: Number, required: true },
    location: { type: String, required: true },
    manufacturer: { type: String, required: true },
    speed: { type: Number, required: true },
  },
  { _id: false },
);

const memorySchema = new Schema<Memory>(
  {
    available: { type: Number, required: true },
    ram_slots: [ramSlotSchema],
    total: { type: Number, required: true },
    usage_percent: { type: Number, required: true },
    used: { type: Number, required: true },
  },
  { _id: false },
);

const networkDeviceSchema = new Schema<NetworkDevice>(
  {
    ip_address: { type: String, required: true },
    mac_address: { type: String, required: true },
    name: { type: String, required: true },
    status: { type: String, required: true },
  },
  { _id: false },
);

const testSchema = new Schema<Test>(
  {
    status: { type: String, required: true },
    timestamp: { type: String, required: true },
    type: { type: String, required: true },
  },
  { _id: false },
);

const testResultSchema = new Schema<TestResult>(
  {
    name: { type: String, required: true },
    test_id: { type: Number, required: true },
    status: { type: String },
    timestamp: { type: String },
    total_keys: { type: Number },
    port_count: { type: Number },
    target: { type: String },
    tests: [testSchema],
  },
  { strict: false, _id: false },
);

const specificationSchema = new Schema<Specification>(
  {
    audio: [{ type: Schema.Types.Mixed }],
    battery: { type: Schema.Types.Mixed, required: true },
    cpu: [{ type: Schema.Types.Mixed }],
    gpu: [{ type: Schema.Types.Mixed }],
    memory: { type: memorySchema, required: true },
    monitors: [{ type: Schema.Types.Mixed }],
    motherboard: { type: Schema.Types.Mixed, required: true },
    network: {
      ethernet: [networkDeviceSchema],
      wifi: [networkDeviceSchema],
    },
    storage: [{ type: Schema.Types.Mixed }],
  },
  { _id: false },
);

const summarySchema = new Schema<Summary>(
  {
    completed_at: { type: String, required: true },
    duration: { type: String, required: true },
    failed: { type: Number, required: true },
    pass_rate: { type: Number, required: true },
    passed: { type: Number, required: true },
    results: [testResultSchema],
    test_date: { type: String, required: true },
    total: { type: Number, required: true },
  },
  { _id: false },
);

export interface ResultDocument extends Document {
  _id: Types.ObjectId;
  operator_id: Types.ObjectId;
  template_id: Types.ObjectId;
  product: string;
  serial_number: string;
  specification: Specification;
  summary: Summary;
  createdAt: Date;
  updatedAt: Date;
}

const resultSchema = new Schema<ResultDocument>(
  {
    operator_id: { type: Schema.Types.ObjectId, ref: 'Operator', required: true },
    template_id: { type: Schema.Types.ObjectId, ref: 'Template', required: true },
    product: { type: String, required: true, trim: true },
    serial_number: { type: String, required: true, trim: true },
    specification: { type: specificationSchema, required: true },
    summary: { type: summarySchema, required: true },
  },
  {
    collection: 'results',
    timestamps: true,
  },
);

resultSchema
  .index({ serial_number: 1 }, { unique: true })
  .index({ operator_id: 1, template_id: 1 })
  .index({ operator_id: 1, product: 1 })
  .index({ template_id: 1, product: 1 })
  .index({ createdAt: -1, operator_id: 1 })
  .index({ createdAt: -1, template_id: 1 });

export const ResultModel = model<ResultDocument>('Result', resultSchema);
