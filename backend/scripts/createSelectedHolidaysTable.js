import 'dotenv/config';
import postgres from 'postgres';

const getConnectionString = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const dbUser = process.env.DB_USER || 'postgres';
  const dbPassword = process.env.DB_PASSWORD || 'postgres';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5432';
  const dbName = process.env.DB_NAME || 'smart_attendance';

  return `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
};

const main = async () => {
  const connectionString = getConnectionString();
  const sql = postgres(connectionString);

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS public.selected_optional_holidays (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        holiday_id integer NOT NULL,
        year integer NOT NULL,
        selected_by uuid REFERENCES public.users(id),
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS selected_holidays_holiday_year_idx
      ON public.selected_optional_holidays (holiday_id, year)
    `);

    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS selected_holidays_year_idx
      ON public.selected_optional_holidays (year)
    `);

    console.log('✅ selected_optional_holidays table ensured');
  } catch (error) {
    console.error('❌ Failed to create selected_optional_holidays table:', error);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
};

main();

