import { createRoute } from '@tanstack/react-router';
import { Root } from './__root';
import { Analytics } from '../pages/analytics/Analytics';

export const AnalyticsRoute = createRoute({
  getParentRoute: () => Root,
  path: '/analytics',
  component: Analytics,
});
