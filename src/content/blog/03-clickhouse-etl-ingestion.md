---
title: "ClickHouse [Part 3] ETL & Data Ingestion: Feeding the Analytics Beast"
date: 2025-08-03
description: "Master the art of getting data into ClickHouse efficiently, from simple batch loads to real-time streaming pipelines."
tags: ["ClickHouse", "ETL", "Data Pipeline", "Kafka"]
---

# ClickHouse ETL & Data Ingestion: Feeding the Analytics Beast

Hey there, data pipeline architect! 🚰

Welcome back to our ClickHouse journey! By now, you've got the fundamentals down and you can design schemas that would make a database administrator shed a happy tear. Today, we're tackling something equally important: getting data INTO your beautifully designed tables.

Think of this as learning how to feed your pet dragon. ClickHouse is hungry for data, and feeding it properly means the difference between a happy, high-performing analytics engine and... well, let's just say you don't want to see ClickHouse when it's hangry.

## The Many Flavors of Data Ingestion

Just like there are different ways to feed a pet (kibble, treats, home-cooked meals), there are different patterns for getting data into ClickHouse, each with its own trade-offs and use cases.

### The Batch Approach: "Sunday Meal Prep" Style

Batch ingestion is like meal prepping - you do it periodically, usually with larger amounts of data, and it keeps things running smoothly for a while.

```

-- Simple batch insert from CSV
INSERT INTO sales_data
FROM INFILE '/path/to/sales_data.csv'
FORMAT CSVWithNames;

-- Batch insert with some transformation
INSERT INTO cleaned_events
SELECT
toDateTime(timestamp_str) as timestamp,
JSONExtractString(raw_data, 'user_id') as user_id,
JSONExtractString(raw_data, 'event_type') as event_type
FROM raw_events_staging
WHERE timestamp_str IS NOT NULL;

```

**When to use batch ingestion:**
- Daily/hourly ETL jobs
- Historical data migration
- Data warehouse loading
- When you can tolerate some delay between data creation and availability

### The Streaming Approach: "Continuous Snacking" Style

Streaming ingestion is like having a continuous snack supply - data flows in steadily, and your analytics are always fresh.

```

-- Create a Kafka table engine (more on this below!)
CREATE TABLE events_queue (
timestamp DateTime,
user_id UInt32,
event_type String,
properties String
) ENGINE = Kafka()
SETTINGS
kafka_broker_list = 'localhost:9092',
kafka_topic_list = 'user_events',
kafka_group_name = 'clickhouse_consumers',
kafka_format = 'JSONEachRow';

```

**When to use streaming ingestion:**
- Real-time dashboards
- Fraud detection
- Live monitoring
- When freshness matters more than perfect ordering

## Getting Cozy with CSV Files

Let's start with something familiar - good old CSV files. They're like the comfort food of data ingestion.

```

-- Basic CSV ingestion
INSERT INTO website_logs
FROM INFILE 'access_logs.csv'
FORMAT CSVWithNames
SETTINGS input_format_skip_unknown_fields = 1;

-- More control with explicit parsing
INSERT INTO website_logs (timestamp, ip, url, status_code, response_time)
FROM INFILE 'access_logs.csv'
FORMAT CSV;

-- Handle messy data with error tolerance
INSERT INTO website_logs
FROM INFILE 'messy_logs.csv'
FORMAT CSVWithNames
SETTINGS
input_format_allow_errors_num = 100,
input_format_allow_errors_ratio = 0.1;

```

**Pro tip:** Always check your data first! Use `LIMIT` to preview before inserting everything:

```

-- Preview first 10 rows without inserting
SELECT * FROM input('sample.csv', 'CSV', 'col1 String, col2 Int32, col3 DateTime')
LIMIT 10;

```

## JSON: The Universal Language

JSON is everywhere these days, and ClickHouse handles it beautifully:

```

-- Insert JSON data
INSERT INTO events FORMAT JSONEachRow
{"timestamp": "2025-08-03 10:00:00", "user_id": 123, "event": "page_view"}
{"timestamp": "2025-08-03 10:01:00", "user_id": 456, "event": "button_click"}

-- Extract nested JSON during insert
INSERT INTO user_actions
SELECT
timestamp,
JSONExtractUInt(data, 'user_id') as user_id,
JSONExtractString(data, 'action') as action,
JSONExtractString(data, 'metadata', 'page') as page
FROM json_staging;

-- Handle arrays in JSON
SELECT
user_id,
JSONExtractArrayRaw(data, 'purchases') as purchases_array
FROM user_data;

```

## The Kafka Connection: Real-Time Streaming Done Right

Now we're getting to the exciting stuff! Kafka integration in ClickHouse is where the magic really happens for real-time analytics.

### Setting Up Kafka Engine Tables

```

-- Create a Kafka engine table (this is like a "connector")
CREATE TABLE events_kafka_queue (
event_time DateTime,
user_id UInt32,
event_type LowCardinality(String),
properties Map(String, String)
) ENGINE = Kafka()
SETTINGS
kafka_broker_list = 'localhost:9092',
kafka_topic_list = 'user_events',
kafka_group_name = 'clickhouse_group',
kafka_format = 'JSONEachRow',
kafka_num_consumers = 2;

-- Create your actual storage table
CREATE TABLE events_storage (
event_time DateTime,
user_id UInt32,
event_type LowCardinality(String),
properties Map(String, String)
) ENGINE = MergeTree()
ORDER BY (event_time, user_id)
PARTITION BY toYYYYMM(event_time);

-- Create a materialized view to move data from queue to storage
CREATE MATERIALIZED VIEW events_mv TO events_storage AS
SELECT
event_time,
user_id,
event_type,
properties
FROM events_kafka_queue
WHERE event_time > '2025-01-01';  -- Basic filtering

```

This setup creates a continuous pipeline: Kafka → Kafka Engine Table → Materialized View → Storage Table.

### Advanced Streaming Patterns

```

-- Transform data during streaming
CREATE MATERIALIZED VIEW enriched_events_mv TO events_storage AS
SELECT
event_time,
user_id,
event_type,
properties,
-- Add some enrichment
if(event_type = 'purchase', 'revenue', 'engagement') as event_category,
toHour(event_time) as event_hour,
-- Extract common properties
properties['page_url'] as page_url,
CAST(properties['session_duration'], 'UInt32') as session_duration
FROM events_kafka_queue
WHERE event_time BETWEEN now() - INTERVAL 1 HOUR AND now() + INTERVAL 1 HOUR;

```

## Working with S3 and Cloud Storage

Modern data lakes often live in cloud storage. ClickHouse plays nicely with S3:

```

-- Read directly from S3
SELECT * FROM s3(
'https://my-bucket.s3.amazonaws.com/data/*.parquet',
'parquet'
) LIMIT 100;

-- Insert from S3 into your table
INSERT INTO events_storage
SELECT * FROM s3(
'https://my-bucket.s3.amazonaws.com/events/2025/08/*.parquet',
'parquet'
);

-- Create an S3 table for regular access
CREATE TABLE events_s3 (
timestamp DateTime,
user_id UInt32,
event_type String
) ENGINE = S3('https://my-bucket.s3.amazonaws.com/events/*.parquet', 'parquet');

```

## Building Robust ETL Pipelines

Let's put it all together with a real-world ETL pattern that handles errors gracefully:

```

-- 1. Create staging table for raw data
CREATE TABLE events_staging (
raw_data String,
ingestion_time DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY ingestion_time;

-- 2. Create error table for problematic records
CREATE TABLE events_errors (
raw_data String,
error_message String,
ingestion_time DateTime
) ENGINE = MergeTree()
ORDER BY ingestion_time;

-- 3. Create production table
CREATE TABLE events_production (
event_time DateTime,
user_id UInt32,
event_type String,
properties Map(String, String),
processed_time DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (event_time, user_id)
PARTITION BY toYYYYMM(event_time);

-- 4. ETL materialized view with error handling
CREATE MATERIALIZED VIEW events_etl_mv AS
SELECT
JSONExtractString(raw_data, 'timestamp')::DateTime as event_time,
JSONExtractUInt(raw_data, 'user_id') as user_id,
JSONExtractString(raw_data, 'event_type') as event_type,
CAST(JSONExtractString(raw_data, 'properties'), 'Map(String, String)') as properties
FROM events_staging
WHERE JSONHas(raw_data, 'timestamp')
AND JSONHas(raw_data, 'user_id')
AND JSONHas(raw_data, 'event_type');

```

## Performance Tips for Data Ingestion

Here are some hard-won lessons about making your ingestion pipeline purr like a happy cat:

### Batch Size Matters

```

-- Good: Insert in reasonable batches (10K-100K rows)
INSERT INTO events SELECT * FROM staging LIMIT 50000;

-- Not so good: Inserting one row at a time
-- (ClickHouse really doesn't like this!)

```

### Use Async Inserts for High-Frequency Small Batches

```

-- Enable async inserts
SET async_insert = 1;
SET wait_for_async_insert = 0;

-- Now small inserts get batched automatically
INSERT INTO events VALUES (...);

```

### Compress Your Data

```

-- Use compressed formats when possible
INSERT INTO events FROM INFILE 'data.csv.gz' COMPRESSION 'gzip' FORMAT CSV;

-- Or use more efficient formats
INSERT INTO events FROM INFILE 'data.parquet' FORMAT Parquet;

```

## Monitoring and Troubleshooting

Because things don't always go smoothly (and that's okay!):

```

-- Check insert performance
SELECT
table,
sum(bytes) as total_bytes,
sum(rows) as total_rows,
avg(bytes/rows) as avg_bytes_per_row
FROM system.parts
WHERE table = 'events_production'
GROUP BY table;

-- Monitor Kafka consumers
SELECT * FROM system.kafka_consumers;

-- Check for errors in materialized views
SELECT * FROM system.errors
WHERE name LIKE '%MaterializedView%';

-- See what's happening with background processes
SELECT * FROM system.mutations
WHERE table = 'events_production';

```

## Handling Data Quality Issues

Real-world data is messy. Here's how to handle it gracefully:

```

-- Data validation during insert
INSERT INTO clean_events
SELECT
timestamp,
user_id,
event_type,
properties
FROM raw_events
WHERE timestamp BETWEEN '2020-01-01' AND now() + INTERVAL 1 DAY
AND user_id > 0
AND event_type != ''
AND length(properties) < 10000;  -- Avoid huge JSON blobs

-- Create data quality metrics
CREATE MATERIALIZED VIEW data_quality_metrics
ENGINE = SummingMergeTree()
ORDER BY (date, metric_name) AS
SELECT
toDate(now()) as date,
'total_records' as metric_name,
count() as metric_value
FROM raw_events
UNION ALL
SELECT
toDate(now()) as date,
'invalid_timestamps' as metric_name,
countIf(timestamp < '2020-01-01' OR timestamp > now() + INTERVAL 1 DAY)
FROM raw_events;

```

## Integration Patterns

### dbt + ClickHouse

If you're using dbt (and you should!), here's a common pattern:

```

-- models/staging/stg_events.sql
{{ config(
materialized='incremental',
unique_key='event_id',
incremental_strategy='append'
) }}

SELECT
JSONExtractString(raw_data, 'event_id') as event_id,
parseDateTime64BestEffort(JSONExtractString(raw_data, 'timestamp')) as event_time,
JSONExtractUInt(raw_data, 'user_id') as user_id,
JSONExtractString(raw_data, 'event_type') as event_type
FROM {{ ref('raw_events') }}
{% if is_incremental() %}
WHERE event_time > (SELECT max(event_time) FROM {{ this }})
{% endif %}

```

### Apache Airflow Integration

```


# In your Airflow DAG

from airflow.providers.postgres.hooks.postgres import PostgresHook

def load_data_to_clickhouse():
clickhouse_hook = PostgresHook(postgres_conn_id='clickhouse')

    sql = """
    INSERT INTO events_production
    SELECT * FROM s3(
        'https://data-bucket.s3.amazonaws.com/events/{{ ds }}/*.parquet',
        'parquet'
    )
    """
    
    clickhouse_hook.run(sql)
    ```

## What's Coming Next?

In our next adventure, we'll dive into advanced querying techniques that'll make you feel like a ClickHouse wizard:
- Materialized views that update themselves
- Window functions for time-series analysis
- Array functions for complex data
- Approximate algorithms for massive-scale analytics
- Integration with visualization tools

## Your Pipeline Building Challenge

Try building a simple streaming pipeline! Here's a fun exercise:

1. Set up a simple Kafka topic (or use a file-based approach)
2. Create a staging table and a production table
3. Build a transformation that cleans and enriches the data
4. Add some basic monitoring
5. Test it with sample data

Don't worry about making it perfect - the goal is to get your hands dirty and see how the pieces fit together.

## Wrapping Up

Data ingestion in ClickHouse is like learning to cook - there are basic techniques that apply everywhere, but each dish (or data source) has its own quirks and requirements. The key is to start simple and gradually add complexity as you understand your data better.

Remember:
- Start with batch processing and add streaming when you need it
- Always validate your data (but don't let perfect be the enemy of good)
- Monitor your pipelines (they will break, and that's normal!)
- Build in error handling from the start

You're building real data infrastructure now! Next time, we'll explore the fun part - querying all this beautiful data you've loaded and discovering insights that make people go "wow!"

Keep feeding that analytics beast! 🐉📊