import 'dotenv/config';

// Ensure imports of the application's Prisma singleton use the disposable test database.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
