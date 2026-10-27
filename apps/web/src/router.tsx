import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { AppLayout } from "./components/AppLayout";
import { RequireAuth } from "./components/RequireAuth";
import { AssessmentFormPage } from "./pages/AssessmentFormPage";
import { ConditioningFormPage } from "./pages/ConditioningFormPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { HistoryPage } from "./pages/HistoryPage";
import { ImportPage } from "./pages/ImportPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkoutLoggerPage } from "./pages/WorkoutLoggerPage";

export const routes: RouteObject[] = [
  { path: "/", element: <LandingPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: <RequireAuth requireProfile={false} />,
    children: [{ path: "/onboarding", element: <OnboardingPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/workouts/new", element: <WorkoutLoggerPage /> },
          { path: "/workouts/:id/edit", element: <WorkoutLoggerPage /> },
          { path: "/conditioning/new", element: <ConditioningFormPage /> },
          { path: "/conditioning/:id/edit", element: <ConditioningFormPage /> },
          { path: "/assessments/new", element: <AssessmentFormPage /> },
          { path: "/assessments/:id/edit", element: <AssessmentFormPage /> },
          { path: "/history", element: <HistoryPage /> },
          { path: "/import", element: <ImportPage /> },
          // Lazy: keeps Recharts out of the main bundle.
          { path: "/progress", lazy: () => import("./pages/ProgressPage").then((m) => ({ Component: m.ProgressPage })) },
          { path: "/report", lazy: () => import("./pages/ReportPage").then((m) => ({ Component: m.ReportPage })) },
          { path: "/settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
];

export const router = createBrowserRouter(routes);
