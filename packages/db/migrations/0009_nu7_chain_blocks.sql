CREATE TABLE "chain_blocks" (
	"network" text NOT NULL,
	"height" integer NOT NULL,
	"time" timestamp with time zone NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chain_blocks_network_height_pk" PRIMARY KEY("network","height"),
	CONSTRAINT "chain_blocks_network_valid" CHECK ("chain_blocks"."network" IN ('mainnet', 'testnet'))
);
