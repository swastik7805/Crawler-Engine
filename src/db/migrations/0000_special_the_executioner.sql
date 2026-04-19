DO $$ BEGIN
 CREATE TYPE "public"."crawl_status" AS ENUM('pending', 'in_progress', 'completed', 'failed', 'skipped');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"meta_keywords" text[],
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"word_count" integer NOT NULL,
	"content_tsv" "tsvector",
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crawl_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"status" "crawl_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"crawl_depth" integer DEFAULT 2 NOT NULL,
	"respect_robots" boolean DEFAULT true NOT NULL,
	"last_crawled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer,
	"url" text NOT NULL,
	"title" text,
	"meta_description" text,
	"meta_keywords" text[],
	"canonical_url" text,
	"content_hash" text,
	"crawled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_source_id_crawl_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."crawl_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chunks_document_id_idx" ON "chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chunks_url_idx" ON "chunks" USING btree ("url");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crawl_sources_url_unique_idx" ON "crawl_sources" USING btree ("url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawl_sources_domain_idx" ON "crawl_sources" USING btree ("domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawl_sources_status_priority_idx" ON "crawl_sources" USING btree ("status","priority");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documents_url_unique_idx" ON "documents" USING btree ("url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_content_hash_idx" ON "documents" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_source_id_idx" ON "documents" USING btree ("source_id");