CREATE TABLE `conditioning_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_date` text NOT NULL,
	`type` text NOT NULL,
	`duration_s` real NOT NULL,
	`distance_value` real,
	`distance_unit` text,
	`distance_m` real,
	`session_rpe` real NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "conditioning_date_chk" CHECK(date("conditioning_sessions"."session_date") IS "conditioning_sessions"."session_date"),
	CONSTRAINT "conditioning_type_chk" CHECK("conditioning_sessions"."type" IN ('run', 'sprint', 'intervals', 'other')),
	CONSTRAINT "conditioning_duration_chk" CHECK("conditioning_sessions"."duration_s" > 0),
	CONSTRAINT "conditioning_rpe_chk" CHECK("conditioning_sessions"."session_rpe" BETWEEN 0 AND 10),
	CONSTRAINT "conditioning_distance_chk" CHECK(("conditioning_sessions"."distance_value" IS NULL AND "conditioning_sessions"."distance_unit" IS NULL AND "conditioning_sessions"."distance_m" IS NULL)
        OR ("conditioning_sessions"."distance_value" > 0 AND "conditioning_sessions"."distance_unit" IN ('m', 'km', 'mi') AND "conditioning_sessions"."distance_m" > 0))
);
--> statement-breakpoint
CREATE INDEX `conditioning_user_date_idx` ON `conditioning_sessions` (`user_id`,`session_date`);