-- Hand-edited: drizzle-kit omits ON DELETE from ALTER TABLE ... ADD ... REFERENCES; the schema declares SET NULL.
CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`file_sha256` text NOT NULL,
	`status` text NOT NULL,
	`row_count` integer NOT NULL,
	`accepted_count` integer NOT NULL,
	`rejected_count` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "import_jobs_kind_chk" CHECK("import_jobs"."kind" IN ('workouts', 'conditioning', 'assessments')),
	CONSTRAINT "import_jobs_status_chk" CHECK("import_jobs"."status" IN ('preview', 'confirmed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_jobs_user_file_idx` ON `import_jobs` (`user_id`,`file_sha256`);--> statement-breakpoint
CREATE INDEX `import_jobs_status_expiry_idx` ON `import_jobs` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `import_row_errors` (
	`id` text PRIMARY KEY NOT NULL,
	`import_job_id` text NOT NULL,
	`row_number` integer NOT NULL,
	`field` text NOT NULL,
	`message` text NOT NULL,
	FOREIGN KEY (`import_job_id`) REFERENCES `import_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `import_row_errors_job_idx` ON `import_row_errors` (`import_job_id`,`row_number`);--> statement-breakpoint
CREATE TABLE `import_staged_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`import_job_id` text NOT NULL,
	`row_number` integer NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`import_job_id`) REFERENCES `import_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `import_staged_rows_job_idx` ON `import_staged_rows` (`import_job_id`,`row_number`);--> statement-breakpoint
ALTER TABLE `workouts` ADD `import_job_id` text REFERENCES import_jobs(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `conditioning_sessions` ADD `import_job_id` text REFERENCES import_jobs(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `assessment_results` ADD `import_job_id` text REFERENCES import_jobs(id) ON DELETE SET NULL;