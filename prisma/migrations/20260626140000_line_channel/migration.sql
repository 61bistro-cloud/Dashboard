-- Business: LINE Messaging API channel (receive evidence via LINE)
ALTER TABLE "Business" ADD COLUMN "lineChannelSecret" TEXT;
ALTER TABLE "Business" ADD COLUMN "lineChannelToken" TEXT;
