import { createRoute } from '@tanstack/react-router';
import { Root } from './__root';
import { Connectors } from '../pages/connectors/Connectors';

export const ConnectorsRoute = createRoute({
  getParentRoute: () => Root,
  path: '/connectors',
  component: Connectors,
});
