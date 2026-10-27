-- Reference data. Must match packages/shared/src/catalog.ts (enforced by test/catalog.test.ts).
INSERT INTO `sports` (`id`, `name`) VALUES
  ('rugby_union', 'Rugby union'),
  ('rugby_league', 'Rugby league'),
  ('rugby_sevens', 'Rugby sevens');
--> statement-breakpoint
INSERT INTO `athletic_goals` (`id`, `name`, `quality`) VALUES
  ('acceleration', 'Improve acceleration', 'speed'),
  ('max_strength', 'Build maximal strength', 'strength'),
  ('lower_body_power', 'Increase lower-body power', 'power'),
  ('conditioning', 'Improve conditioning', 'conditioning');
