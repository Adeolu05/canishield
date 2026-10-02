CREATE TABLE "worker_heartbeats" (
	"network" text PRIMARY KEY NOT NULL,
	"tip" integer NOT NULL,
	"endpoint" text NOT NULL,
	"seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "worker_heartbeats_network_valid" CHECK ("worker_heartbeats"."network" IN ('mainnet', 'testnet'))
);
