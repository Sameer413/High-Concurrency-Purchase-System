# Fast Product Search with Elasticsearch (ELK)

This plan outlines the steps to integrate Elasticsearch into your NestJS backend to provide blazing fast, typo-tolerant, and scalable product search, replacing traditional slow SQL `LIKE` queries.

## User Review Required

> [!IMPORTANT]
> Elasticsearch is a memory-intensive application. Running it locally via Docker will consume around 1-2GB of RAM. Please ensure your development machine has sufficient resources.

> [!WARNING]
> We will need to keep Postgres and Elasticsearch data synchronized. Every time a product is created, updated, or deleted in Postgres, we must mirror that change in Elasticsearch.

## Open Questions

1. **Kibana:** Do you also want to add Kibana to your `docker-compose.yml`? Kibana provides a nice UI to query and visualize your Elasticsearch data, but it uses extra RAM. We can start with just Elasticsearch if you prefer to keep it lightweight.
2. **Search Features:** Do you want standard keyword search, or should we include advanced features like **Fuzzy Search** (handles typos like "smasung" -> "samsung") and **Auto-complete** (suggestions as the user types)?
3. **Searchable Fields:** Which fields should users be able to search by? (Typically: `name`, `description`, `category`).

## Proposed Changes

---

### Infrastructure Layer

#### [MODIFY] docker-compose.yml
- Add an `elasticsearch` service using the `docker.elastic.co/elasticsearch/elasticsearch:8.x` image.
- Configure it as a single-node cluster with security disabled for local development to simplify connectivity.
- Expose port `9200`.

---

### Application Setup

#### [MODIFY] server/package.json
- Install required dependencies: 
  - `@nestjs/elasticsearch`
  - `@elastic/elasticsearch`

#### [MODIFY] server/.env
- Add `ELASTICSEARCH_NODE=http://localhost:9200` to your environment variables.

#### [MODIFY] server/src/app.module.ts
- Import and configure the `ElasticsearchModule` globally or within a new Search module.

---

### Search Module

#### [NEW] server/src/modules/search/search.module.ts
- Define a dedicated module to encapsulate all Elasticsearch logic.

#### [NEW] server/src/modules/search/search.service.ts
- **Index Management:** Methods to create the `products` index with proper mappings (defining which fields are `text` for full-text search and which are `keyword` for exact filtering like categories).
- **CRUD Operations:** Methods to `indexProduct`, `updateProduct`, and `removeProduct` to interact with the Elasticsearch cluster.
- **Search Query Builder:** A robust `search` method that accepts query strings, filters (price, category), and pagination, translating them into Elasticsearch JSON queries.

---

### Data Synchronization

#### [MODIFY] server/src/modules/product/product.service.ts
- Inject the `SearchService`.
- Modify `create`, `update`, and `remove` methods to call the respective `SearchService` methods immediately after successful Postgres transactions.

#### [NEW] server/src/scripts/sync-elastic.ts (Optional but Recommended)
- A utility script to perform an initial bulk load of all existing Postgres products into Elasticsearch.

---

### API Endpoints

#### [MODIFY] server/src/modules/product/product.controller.ts
- Update the existing search/filter endpoint (or create a new one like `GET /products/search`) to route queries through the `SearchService` instead of querying the Postgres database directly.

## Verification Plan

### Automated Tests
- N/A for this scope, relying on manual verification.

### Manual Verification
1. Run `docker-compose up -d` and verify Elasticsearch is running on port 9200.
2. Run the synchronization script to index existing products.
3. Test the search endpoint using Postman or Swagger with various queries (exact matches, partial matches, category filters) to ensure results are accurate and returned quickly from Elasticsearch.
