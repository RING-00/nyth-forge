<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./img/forge-white.png">
  <source media="(prefers-color-scheme: light)" srcset="./img/forge-black.png">
  <img alt="NYTH Forge Logo" src="./img/forge-black.png" width="350">
</picture>

## API Documentation

This document provides a comprehensive list of all available API endpoints and their supported parameters.

## Authentication
Some endpoints may require API key authentication. Check individual endpoint requirements.

## Response Format
All responses follow a standardized JSON format with consistent error handling and pagination support.

## Field Selection
The API supports selective field responses using the `fields` query parameter. This allows you to specify exactly which fields to include in the response, reducing payload size and improving performance.

### Basic Usage
- **Format**: `fields=field1,field2,field3`
- **Separator**: Use comma (,) to separate multiple fields
- **Case**: Field names should use snake_case (e.g., `category_name`)

### Nested Field Selection
Use dot notation (.) to select nested fields:
- **Single nested field**: `fields=specification.memory.total`
- **Multiple nested fields**: `fields=specification.memory.total,specification.cpu,summary.pass_rate`
- **Multiple nested fields**: `fields=specification.memory.total,specification.cpu`

### Examples
```
# Get only category names
GET /categories?fields=category_name

# Get template with nested category info
GET /templates?fields=template_name,category.category_name

# Get results with specific nested fields
GET /results?fields=serial_number,specification.memory.total,summary.pass_rate

# Get operators with stats
GET /operators?fields=operator_name,stats.total_passed_tests
```

### Limitations & Best Practices
- **Path collision**: Do not include both parent and nested fields in the same request
  - ❌ `fields=specification,specification.memory.total` (causes error)
  - ✅ `fields=specification.memory.total` (only nested field)
  - ✅ `fields=specification.memory` (parent object)
- Maximum nesting depth: 2 levels
- Invalid fields are automatically filtered out
- System fields (starting with _) are excluded except `_id`
- Dangerous keys are sanitized for security

### Common Error: Path Collision
When you include both a parent field and its nested child field, MongoDB throws a "Path collision" error. To avoid this:

**Incorrect usage (will cause error):**
```
fields=specification,specification.memory.total
```

**Correct usage:**
```
# If you want specific nested fields
fields=specification.memory.total,specification.cpu

# If you want the entire specification object
fields=specification
```

## Modules Overview

### 1. Categories Module (`/categories`)

#### CRUD Endpoints
- **GET** `/categories` - List all categories with pagination and filtering
  - **Query Parameters:**
    - `page` (number): Page number (default: 1)
    - `limit` (number): Items per page (default: 10)
    - `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)
    - `category_name` (string): Filter by category name
    - `sort` (string): Sort field
    - `order` (string): Sort order ('asc' or 'desc')

- **GET** `/categories/:id` - Get category by ID
  - **Path Parameters:**
    - `id` (string): Category ID
  - **Query Parameters:**
    - `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)

- **POST** `/categories` - Create new category
  - **Body Parameters:**
    - `category_name` (string, required): Category name (2-100 characters, unique)

- **PUT** `/categories/:id` - Update category
  - **Path Parameters:**
    - `id` (string): Category ID
  - **Body Parameters:**
    - `category_name` (string, optional): Updated category name (2-100 characters, unique)

- **DELETE** `/categories/:id` - Delete category
  - **Path Parameters:**
    - `id` (string): Category ID

#### Additional Endpoints
- **GET** `/categories/all` - Get all categories without pagination
  - **Query Parameters:**
    - `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)

- **GET** `/categories/name/:categoryName` - Get category with templates by name
  - **Path Parameters:**
    - `categoryName` (string): Category name
  - **Query Parameters:**
    - `page` (number): Page number for templates (default: 1)
    - `limit` (number): Templates per page (default: 10)
    - `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)

### 2. Templates Module (`/templates`)

#### CRUD Endpoints
- **GET** `/templates` - List all templates with pagination and filtering
  - **Query Parameters:**
    - `page` (number): Page number (default: 1)
    - `limit` (number): Items per page (default: 10)
    - `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)
    - `category_id` (string): Filter by category ID
    - `template_name` (string): Filter by template name
    - `template_code` (string): Filter by template code
    - `sort` (string): Sort field
    - `order` (string): Sort order ('asc' or 'desc')

- **GET** `/templates/:id` - Get template by ID
  - **Path Parameters:**
    - `id` (string): Template ID
  - **Query Parameters:**
    - `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)

- **POST** `/templates` - Create new template
  - **Body Parameters:**
    - `template_name` (string, required): Template name (1-100 characters, unique)
    - `template_code` (string, required): Template code (max 500 characters)
    - `category_id` (string, required): Associated category ID (MongoDB ObjectId)

- **PUT** `/templates/:id` - Update template
  - **Path Parameters:**
    - `id` (string): Template ID
  - **Body Parameters:**
    - `template_name` (string, optional): Updated template name (1-100 characters, unique)
    - `template_code` (string, optional): Updated template code (max 500 characters)
    - `category_id` (string, optional): Updated category ID (MongoDB ObjectId)

- **DELETE** `/templates/:id` - Delete template
  - **Path Parameters:**
    - `id` (string): Template ID

#### Additional Endpoints
- **GET** `/templates/all` - Get all templates without pagination
  - **Query Parameters:**
    - `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)

- **GET** `/templates/category/:categoryId` - Get templates by category
  - **Path Parameters:**
    - `categoryId` (string): Category ID
  - **Query Parameters:**
    - `page` (number): Page number (default: 1)
    - `limit` (number): Items per page (default: 10)
    - `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)

- **GET** `/templates/name/:templateName` - Get template with usage stats by name
  - **Path Parameters:**
    - `templateName` (string): Template name
  - **Query Parameters:**
    - `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)

### 3. Operators Module (`/operators`)

#### CRUD Endpoints
- **GET** `/operators` - List all operators with pagination and filtering
  - **Query Parameters:**
    - `page` (number): Page number (default: 1)
    - `limit` (number): Items per page (default: 10)
    - `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)
    - `operator_name` (string): Filter by operator name
    - `sort` (string): Sort field
    - `order` (string): Sort order ('asc' or 'desc')

- **GET** `/operators/:id` - Get operator by ID
  - **Path Parameters:**
    - `id` (string): Operator ID
  - **Query Parameters:**
    - `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)

- **POST** `/operators` - Create new operator
  - **Body Parameters:**
    - `operator_name` (string, required): Operator name (unique, trimmed)

- **PUT** `/operators/:id` - Update operator
  - **Path Parameters:**
    - `id` (string): Operator ID
  - **Body Parameters:**
    - `operator_name` (string, optional): Updated operator name (unique, trimmed)

- **DELETE** `/operators/:id` - Delete operator
  - **Path Parameters:**
    - `id` (string): Operator ID

#### Additional Endpoints
- **POST** `/operators/:id/calculate-stats` - Recalculate operator statistics
  - **Path Parameters:**
    - `id` (string): Operator ID

- **POST** `/operators/recalculate-all-stats` - Recalculate statistics for all operators
  - **No Parameters Required**

### 4. Results Module (`/results`)

#### Schema Definitions

**Specification Object Structure:**
- `audio` (array): Audio devices information
- `battery` (object): Battery information (required)
- `cpu` (array): CPU information
- `gpu` (array): GPU information  
- `memory` (object): Memory information (required)
  - `available` (number): Available memory in bytes
  - `ram_slots` (array): RAM slot details
  - `total` (number): Total memory in bytes
  - `usage_percent` (number): Memory usage percentage
  - `used` (number): Used memory in bytes
- `monitors` (array): Monitor information
- `motherboard` (object): Motherboard information (required)
- `network` (object): Network devices
  - `ethernet` (array): Ethernet devices
  - `wifi` (array): WiFi devices
- `storage` (array): Storage devices information

**Summary Object Structure:**
- `completed_at` (string): Completion timestamp (required)
- `duration` (string): Test duration (required)
- `failed` (number): Number of failed tests (required)
- `pass_rate` (number): Pass rate percentage (required)
- `passed` (number): Number of passed tests (required)
- `results` (array): Individual test results (required)
- `test_date` (string): Test execution date (required)
- `total` (number): Total number of tests (required)

#### CRUD Endpoints
- **GET** `/results` - List all results with pagination and filtering
  - **Query Parameters:**
    - `page` (number): Page number (default: 1)
    - `limit` (number): Items per page (default: 10)
    - `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)
    - `operator_id` (string): Filter by operator ID
    - `template_id` (string): Filter by template ID
    - `serial_number` (string): Filter by serial number
    - `product` (string): Filter by product
    - `sort` (string): Sort field
    - `order` (string): Sort order ('asc' or 'desc')

- **GET** `/results/:id` - Get result by ID
  - **Path Parameters:**
    - `id` (string): Result ID
  - **Query Parameters:**
    - `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)

- **POST** `/results` - Create new result
  - **Body Parameters:**
    - `operator_id` (string, required): Associated operator ID (MongoDB ObjectId)
    - `template_id` (string, required): Associated template ID (MongoDB ObjectId)
    - `serial_number` (string, required): Serial number (unique, trimmed)
    - `product` (string, required): Product name (trimmed)
    - `specification` (object, required): Complete hardware specification object
    - `summary` (object, required): Test results summary object

- **PUT** `/results/:id` - Update result
  - **Path Parameters:**
    - `id` (string): Result ID
  - **Body Parameters:**
    - `operator_id` (string, optional): Updated operator ID (MongoDB ObjectId)
    - `template_id` (string, optional): Updated template ID (MongoDB ObjectId)
    - `serial_number` (string, optional): Updated serial number (unique, trimmed)
    - `product` (string, optional): Updated product name (trimmed)
    - `specification` (object, optional): Updated hardware specification object
    - `summary` (object, optional): Updated test results summary object

- **DELETE** `/results/:id` - Delete result
  - **Path Parameters:**
    - `id` (string): Result ID

#### Additional Endpoints
- **GET** `/results/operator/:operatorId` - Get results by operator
  - **Path Parameters:**
    - `operatorId` (string): Operator ID
  - **Query Parameters:**
    - `page` (number): Page number (default: 1)
    - `limit` (number): Items per page (default: 10)
    - `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)

- **GET** `/results/serial/:serialNumber` - Get result by serial number
  - **Path Parameters:**
    - `serialNumber` (string): Serial number
  - **Query Parameters:**
    - `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)

### 5. WebSocket Module (`/websockets`)

#### WebSocket Management Endpoints
- **GET** `/websockets/status` - Get WebSocket server status
  - **No Parameters Required**
  - **Response Includes:**
    - Connected clients count
    - Server uptime
    - Cache status
    - Redis connection status

- **GET** `/websockets/clients` - Get connected clients information
  - **No Parameters Required**
  - **Response Includes:**
    - List of connected clients
    - Total client count
    - Real-time data source indicator

- **GET** `/websockets/stats` - Get WebSocket statistics
  - **No Parameters Required**
    - **Response Includes:**
    - Aggregated statistics
    - Fresh database data indicator
    - Cache refresh status

- **GET** `/websockets/cache-info` - Get cache information
  - **No Parameters Required**
  - **Response Includes:**
    - Cache metadata
    - Cache age and TTL
    - Cache type information

- **GET** `/websockets/redis-data` - Get Redis cache data
  - **No Parameters Required**
  - **Response Includes:**
    - Redis connection status
    - List of all keys with values and TTL
    - Key type information
    - Total keys count

- **POST** `/websockets/clear-cache` - Clear WebSocket cache
  - **No Parameters Required**
  - **Response:**
    - Success confirmation

- **POST** `/websockets/cleanup` - Cleanup WebSocket connections
  - **No Parameters Required**
  - **Response:**
    - Success confirmation

## Common Parameters

### Pagination Parameters
Used in paginated endpoints:
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10)

### Field Selection
- `fields` (string): Selective field response (see [Field Selection](#field-selection) for dot notation support)
  - Example: `fields=id,name,createdAt`
  - If omitted, all fields are returned

### Sorting Parameters
- `sort` (string): Field name to sort by
- `order` (string): Sort direction ('asc' or 'desc')

### Filtering Parameters
Each module supports filtering by specific fields:
- **Categories:** `category_name`
- **Templates:** `category_id`, `template_name`, `template_code`
- **Operators:** `operator_name`
- **Results:** `operator_id`, `template_id`, `serial_number`, `product`

## Error Handling
All endpoints follow standardized error handling with consistent response formats based on the project's type definitions.

### Error Response Format
```json
{
  "success": false,
  "message": "Error description",
  "status": 400,
  "error": {
    "code": "ERROR_CODE",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Error Codes (ErrorCode)
- `CONNECTION_ERROR` - Connection to external service failed
- `DATABASE_ERROR` - Database operation failed
- `DOCUMENT_NOT_FOUND` - Document/resource not found
- `DUPLICATE_RESOURCE` - Resource already exists (409)
- `FORBIDDEN` - Access denied (403)
- `HEALTH_CHECK_ERROR` - Service health check failed
- `INTERNAL_SERVER_ERROR` - Internal server error (500)
- `INVALID_INPUT` - Invalid input provided (400)
- `INVALID_OPERATION` - Invalid operation requested
- `MIDDLEWARE_ERROR` - Middleware processing error
- `MISSING_REQUIRED_FIELD` - Required field is missing
- `MONGO_ERROR` - MongoDB specific error
- `NOT_FOUND` - Resource not found (404)
- `OPERATION_FAILED` - Operation failed to complete
- `SERVICE_UNAVAILABLE` - Service unavailable (503)
- `TOO_MANY_REQUESTS` - Rate limit exceeded (429)
- `UNAUTHORIZED` - Authentication required (401)
- `VALIDATION_ERROR` - Input validation failed (400)

### Standard Error Messages
- **Conflict**: "Resource already exists."
- **Database**: "Database operation failed."
- **Forbidden**: "Access denied."
- **Internal**: "An internal server error occurred."
- **Not Found**: "Resource not found."
- **Unauthorized**: "Authentication required."
- **Validation**: "Invalid input provided."

### Validation Errors
For validation errors, additional `errors` array is provided:
```json
{
  "success": false,
  "message": "Invalid input provided",
  "status": 400,
  "errors": [
    {
      "field": "field_name",
      "message": "Validation message",
      "value": "invalid_value"
    }
  ]
}
```

### HTTP Status Codes Mapping
- `400` - BAD_REQUEST (Validation/Invalid Input)
- `401` - UNAUTHORIZED
- `403` - FORBIDDEN
- `404` - NOT_FOUND
- `409` - CONFLICT (Duplicate resource)
- `429` - TOO_MANY_REQUESTS
- `500` - INTERNAL_SERVER_ERROR
- `503` - SERVICE_UNAVAILABLE

## Rate Limiting
API endpoints may include rate limiting. Check response headers for rate limit information.

## WebSocket Real-time Updates
WebSocket connections are available for real-time updates. Connect to the WebSocket endpoint to receive live data updates.