---
title: "ClickHouse [Part 2] Data Modeling: Making Your Data Feel at Home"
date: 2025-07-03
description: "Learn the art and science of designing ClickHouse schemas that perform beautifully and make sense to humans too."
tags: ["ClickHouse", "Data Modeling", "MergeTree", "Performance"]
---

# ClickHouse Data Modeling: Making Your Data Feel at Home

Welcome back, data friend! 🏠

Last time, we got acquainted with ClickHouse and discovered why columnar databases are pretty amazing. Today, we're diving deeper into something that might sound dry but is actually quite creative: data modeling.

Think of data modeling as interior design for your database. Just like a well-designed room makes you feel comfortable and helps you find things easily, a well-designed ClickHouse schema makes your queries fast and your future self grateful.

## The MergeTree Family: Your New Relatives

Remember when I mentioned `ENGINE = MergeTree()` in our coffee shop example? Well, MergeTree isn't just one engine - it's actually a whole family of engines, each with its own personality and strengths.

Let me introduce you to the family:

### MergeTree (The Reliable Cousin)

This is your bread-and-butter engine. Reliable, straightforward, and handles most analytical workloads without breaking a sweat.

```

CREATE TABLE website_analytics (
timestamp DateTime,
user_id UInt32,
page_url String,
session_duration UInt32,
country FixedString(2)
) ENGINE = MergeTree()
ORDER BY (timestamp, user_id)
PARTITION BY toYYYYMM(timestamp);

```

Perfect for logs, events, and time-series data where you mostly insert new records and rarely update existing ones.

### ReplacingMergeTree (The Perfectionist)

This one hates duplicates. If you insert the same data twice, it'll keep only the latest version.

```

CREATE TABLE user_profiles (
user_id UInt32,
email String,
name String,
last_login DateTime,
updated_at DateTime
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY user_id;

```

Great for slowly changing dimensions where you want to keep the most recent state.

### SummingMergeTree (The Mathematician)

This engine automatically sums up numeric columns for rows with the same sorting key. It's like having a built-in calculator!

```

CREATE TABLE hourly_metrics (
hour DateTime,
metric_name String,
value UInt64
) ENGINE = SummingMergeTree(value)
ORDER BY (hour, metric_name)
PARTITION BY toYYYYMM(hour);

```

Perfect for pre-aggregated metrics and counters.

### AggregatingMergeTree (The Statistician)

The sophisticated cousin that can handle complex aggregations, not just sums.

```

CREATE TABLE user_stats_aggregated (
date Date,
user_segment String,
total_users AggregateFunction(uniq, UInt32),
avg_session_duration AggregateFunction(avg, UInt32)
) ENGINE = AggregatingMergeTree()
ORDER BY (date, user_segment)
PARTITION BY toYYYYMM(date);

```

This one requires a bit more setup but gives you incredible performance for complex analytics.

## The Art of Choosing Keys

Now, let's talk about something that might seem abstract but is absolutely crucial: choosing your ORDER BY key (also called the sorting key).

### The ORDER BY Key: Your Data's Home Address

The ORDER BY key determines how ClickHouse physically stores your data on disk. It's like deciding how to organize books in a library - alphabetically by author? By genre? By publication date?

Here's the thing: ClickHouse can answer queries lightning-fast when they filter or group by columns in your ORDER BY key. It's like having a perfectly organized filing system.

Let's look at some examples:

```

-- Good: Queries filtering by timestamp will be fast
CREATE TABLE events (
timestamp DateTime,
user_id UInt32,
event_type String,
data String
) ENGINE = MergeTree()
ORDER BY (timestamp, user_id, event_type);

-- This query will be very fast:
SELECT COUNT(*)
FROM events
WHERE timestamp >= '2025-07-01'
AND timestamp < '2025-07-02';

-- This query will also be fast:
SELECT event_type, COUNT(*)
FROM events
WHERE timestamp >= '2025-07-01'
GROUP BY event_type;

```

But here's where it gets interesting. The order of columns in your ORDER BY key matters:

```

-- If you frequently filter by user_id first, consider:
ORDER BY (user_id, timestamp, event_type)

-- If you usually analyze time ranges first:
ORDER BY (timestamp, user_id, event_type)

```

It's like organizing your closet - do you want to find clothes by type first (all shirts together) or by season first (all summer clothes together)?

## Partitioning: Divide and Conquer

Partitioning is like having multiple filing cabinets instead of one giant one. Each partition is a separate folder that ClickHouse can work with independently.

```

-- Partition by month (very common for time-series data)
PARTITION BY toYYYYMM(timestamp)

-- Partition by day (if you have lots of data and frequently query single days)
PARTITION BY toDate(timestamp)

-- Partition by a categorical field
PARTITION BY country_code

-- Even combine them!
PARTITION BY (toYYYYMM(timestamp), country_code)

```

**Pro tip**: Don't go partition-crazy! Too many small partitions can actually slow things down. A good rule of thumb is to have partitions with at least 10-100GB of data each.

## Data Types: Choosing the Right Tools

ClickHouse offers some really nice data types that can make your queries faster and your storage smaller:

### The Space-Savers

```

-- Instead of String for small, known values:
status Enum8('pending' = 1, 'approved' = 2, 'rejected' = 3)

-- Instead of String for country codes:
country FixedString(2)  -- Always exactly 2 characters

-- For small numbers:
age UInt8              -- 0 to 255
quantity UInt16        -- 0 to 65,535

```

### The Analytics All-Stars

```

-- For nested data (like JSON):
user_properties Map(String, String)

-- For arrays:
tags Array(String)
purchase_amounts Array(Float32)

-- For approximate analytics:
user_sketch AggregateFunction(uniq, UInt32)

```

## Real-World Example: E-commerce Analytics

Let me show you how this all comes together with a real-world example. Imagine we're building analytics for an online store:

```

-- Orders table: optimized for time-based analysis
CREATE TABLE orders (
order_date Date,
order_timestamp DateTime,
order_id UInt64,
customer_id UInt32,
total_amount Decimal(10, 2),
currency FixedString(3),
country FixedString(2),
payment_method Enum8('credit_card' = 1, 'paypal' = 2, 'bank_transfer' = 3),
order_status Enum8('pending' = 1, 'paid' = 2, 'shipped' = 3, 'delivered' = 4)
) ENGINE = MergeTree()
ORDER BY (order_date, customer_id, order_id)
PARTITION BY toYYYYMM(order_date);

-- Order items: optimized for product analysis
CREATE TABLE order_items (
order_date Date,
order_id UInt64,
product_id UInt32,
product_category String,
quantity UInt16,
unit_price Decimal(10, 2),
discount_amount Decimal(10, 2)
) ENGINE = MergeTree()
ORDER BY (product_id, order_date)
PARTITION BY toYYYYMM(order_date);

-- Pre-aggregated daily metrics for dashboards
CREATE TABLE daily_sales_metrics (
date Date,
country FixedString(2),
total_orders UInt32,
total_revenue Decimal(12, 2),
avg_order_value Decimal(10, 2),
new_customers UInt32
) ENGINE = SummingMergeTree(total_orders, total_revenue, new_customers)
ORDER BY (date, country)
PARTITION BY toYYYYMM(date);

```

Notice how each table is optimized for different query patterns:
- Orders table: fast lookups by date range and customer
- Order items: fast analysis by product and time
- Daily metrics: pre-aggregated for super-fast dashboard queries

## Common Pitfalls (Learn from My Mistakes!)

Here are some things I learned the hard way:

### Pitfall #1: Too Many Columns in ORDER BY
```

-- Don't do this (unless you really need it):
ORDER BY (col1, col2, col3, col4, col5, col6, col7)

-- Usually this is better:
ORDER BY (col1, col2, col3)

```

### Pitfall #2: Wrong Column Order
```

-- If you mostly query by user_id, don't do:
ORDER BY (timestamp, user_id)

-- Do this instead:
ORDER BY (user_id, timestamp)

```

### Pitfall #3: Forgetting About Cardinality
```

-- High cardinality (many unique values) should come first:
ORDER BY (user_id, timestamp)  -- Good: user_id has millions of values

-- Not:
ORDER BY (country, user_id)    -- country only has ~200 values

```

## Your Schema Design Checklist

When designing a new table, ask yourself:

1. **How will this data be queried?** (This drives your ORDER BY choice)
2. **How much data will I have?** (This affects partitioning strategy)
3. **How often will data be inserted vs. queried?** (Affects engine choice)
4. **Do I need exact or approximate results?** (Affects whether to use aggregating engines)
5. **What's my tolerance for complexity vs. performance?** (Simple is often better)

## What's Next?

In our next session, we'll tackle the exciting world of getting data INTO ClickHouse efficiently. We'll cover:
- Batch loading strategies
- Real-time streaming ingestion
- ETL pipeline patterns
- Error handling and monitoring
- Integration with popular tools like Kafka and dbt

## Your Mission (Should You Choose to Accept It)

Try designing a schema for something you're familiar with. Maybe:
- Social media posts and interactions
- IoT sensor readings
- Financial transactions
- Website clickstream data

Think about:
- What questions would you want to answer?
- How would you partition the data?
- What would your ORDER BY key be?

Don't worry about getting it perfect - the best schemas evolve over time as you learn more about your data and query patterns.

## Wrapping Up

Data modeling in ClickHouse is part science, part art. The science is understanding how the engines work and choosing appropriate data types. The art is predicting how your data will be used and designing schemas that feel intuitive.

Remember: the best schema is one that makes sense to you and your team, performs well for your most common queries, and can evolve as your needs change.

You're doing great! Next time, we'll get hands-on with loading data and building those pipelines that keep ClickHouse well-fed with fresh data.

Until then, happy modeling! 📊✨