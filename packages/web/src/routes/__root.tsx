import { createRootRoute, Link, Outlet, redirect } from '@tanstack/react-router';
import { Layout } from '../components/layout/Layout';
import { useAuthStore } from '../store/auth.store';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';

export const Root = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    throw redirect({
      to: '/login',
    });
  }

  return (
    <Layout>
      <Outlet />
      <TanStackRouterDevtools />
    </Layout>
  );
}
