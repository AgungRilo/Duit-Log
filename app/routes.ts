import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/_index.tsx'),
  route('dashboard', 'routes/dashboard.tsx'),
  route('history', 'routes/history.tsx'),
  route('edit', 'routes/edit.tsx'),
  route('login', 'routes/login.tsx'),
  route('offline', 'routes/offline.tsx'),
  route('api/sync', 'routes/api.sync.tsx'),
  route('api/budget', 'routes/api.budget.tsx'),
  route('api/recurring', 'routes/api.recurring.tsx'),
] satisfies RouteConfig;
