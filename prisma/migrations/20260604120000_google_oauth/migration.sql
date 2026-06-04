-- Google OAuth users have no password — make column nullable.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
