CREATE TABLE `assessment_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`quality` text NOT NULL,
	`canonical_unit` text NOT NULL,
	`units` text NOT NULL,
	`better_direction` text NOT NULL,
	`allowed_methods` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	CONSTRAINT "assessment_definitions_direction_chk" CHECK("assessment_definitions"."better_direction" IN ('lower', 'higher'))
);
--> statement-breakpoint
CREATE TABLE `assessment_results` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`definition_id` text NOT NULL,
	`assessed_on` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`value_canonical` real NOT NULL,
	`method` text NOT NULL,
	`surface` text,
	`footwear` text,
	`conditions_note` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`definition_id`) REFERENCES `assessment_definitions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessment_results_date_chk" CHECK(date("assessment_results"."assessed_on") IS "assessment_results"."assessed_on"),
	CONSTRAINT "assessment_results_value_chk" CHECK("assessment_results"."value" > 0 AND "assessment_results"."value_canonical" > 0),
	CONSTRAINT "assessment_results_unit_chk" CHECK("assessment_results"."unit" IN ('s', 'cm', 'in'))
);
--> statement-breakpoint
CREATE INDEX `assessment_results_user_def_date_idx` ON `assessment_results` (`user_id`,`definition_id`,`assessed_on`);--> statement-breakpoint
CREATE INDEX `assessment_results_user_date_idx` ON `assessment_results` (`user_id`,`assessed_on`);--> statement-breakpoint
-- Must match ASSESSMENT_DEFINITIONS in packages/shared/src/catalog.ts (enforced by test/assessments.test.ts).
INSERT INTO `assessment_definitions` (`id`, `name`, `quality`, `canonical_unit`, `units`, `better_direction`, `allowed_methods`) VALUES
  ('sprint_20m', '20 m sprint', 'speed', 's', '["s"]', 'lower', '["hand_timed","timing_gates","video_app","other"]'),
  ('vertical_jump', 'Vertical jump', 'power', 'cm', '["cm","in"]', 'higher', '["jump_mat","force_plate","video_app","wall_reach","other"]');
