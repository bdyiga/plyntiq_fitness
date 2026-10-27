CREATE TABLE `workout_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`set_index` integer NOT NULL,
	`reps` integer NOT NULL,
	`load_value` real NOT NULL,
	`load_unit` text NOT NULL,
	`load_kg` real NOT NULL,
	`rpe` real,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "workout_sets_reps_chk" CHECK("workout_sets"."reps" BETWEEN 1 AND 100),
	CONSTRAINT "workout_sets_rpe_chk" CHECK("workout_sets"."rpe" IS NULL OR "workout_sets"."rpe" BETWEEN 1 AND 10),
	CONSTRAINT "workout_sets_load_chk" CHECK("workout_sets"."load_value" >= 0 AND "workout_sets"."load_kg" >= 0),
	CONSTRAINT "workout_sets_unit_chk" CHECK("workout_sets"."load_unit" IN ('kg', 'lb'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_sets_workout_index_unique` ON `workout_sets` (`workout_id`,`set_index`);--> statement-breakpoint
CREATE INDEX `workout_sets_exercise_idx` ON `workout_sets` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workout_date` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workouts_date_chk" CHECK(date("workouts"."workout_date") IS "workouts"."workout_date")
);
--> statement-breakpoint
CREATE INDEX `workouts_user_date_idx` ON `workouts` (`user_id`,`workout_date`);