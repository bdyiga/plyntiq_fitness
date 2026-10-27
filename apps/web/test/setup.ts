import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Lazy routes (Progress, Report) compile Recharts on first import; under a
// parallel run that can exceed the default 1 s wait for findBy* queries.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());
