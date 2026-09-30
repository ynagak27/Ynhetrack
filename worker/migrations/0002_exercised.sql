-- Explicit exercise answer for a day, like `drank`: 1 = exercised, 0 = no exercise, NULL = not answered.
-- Lets a rest day be told apart from a day that simply wasn't logged.
ALTER TABLE daily_log ADD COLUMN exercised INTEGER CHECK (exercised IS NULL OR exercised IN (0, 1));

-- Days that already have exercise sessions count as answered "yes".
UPDATE daily_log SET exercised = 1 WHERE date IN (SELECT DISTINCT date FROM exercise);
