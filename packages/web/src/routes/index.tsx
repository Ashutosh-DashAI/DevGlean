import { createRoute, redirect } from '@tanstack/react-router';
import { Root } from './__root';

export const Index = createRoute({
  getParentRoute: () => Root,
  path: '/',
  component: () => {
    throw redirect({
      to: '/search',
    });
  },
});
