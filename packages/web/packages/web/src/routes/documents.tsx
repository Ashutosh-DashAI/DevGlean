import { createRoute } from '@tanstack/react-router';
import { Root } from './__root';
import { Documents } from '../pages/documents/Documents';

export const DocumentsRoute = createRoute({
  getParentRoute: () => Root,
  path: '/documents',
  component: Documents,
});
