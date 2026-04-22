/// <reference path="./prisma-config.d.ts" />
/// <reference types="node" />

import { defineConfig } from 'prisma/config';

export default defineConfig({
  datasource: {
    // For development, use this URL
    // For production, use environment variable DATABASE_URL
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/wizards',
  },
});
