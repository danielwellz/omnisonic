import { createClient } from "@clickhouse/client";

const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST ?? "http://localhost:8123";
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER ?? "omnisonic";
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD ?? "omnisonic";
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE ?? "insight";

export const clickhouseClient = createClient({
  host: CLICKHOUSE_HOST,
  username: CLICKHOUSE_USER,
  password: CLICKHOUSE_PASSWORD,
  database: CLICKHOUSE_DATABASE
});
