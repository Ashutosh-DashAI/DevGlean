import { createRoute } from '@tanstack/react-router';
import { Root } from './__root';
import { Settings } from '../pages/settings/Settings';

export const SettingsRoute = createRoute({
  getParentRoute: () => Root,
  path: '/settings',
  component: Settings,
});
