import { createRoute } from '@tanstack/react-router';
import { Root } from './__root';
import { OSSExplorer } from '../pages/oss/OSSExplorer';
import { z } from 'zod';

export const OSSRoute = createRoute({
  getParentRoute: () => Root,
  path: '/oss',
  validateSearch: z.object({
    q: z.string().optional(),
    site: z.string().optional(),
  }),
  component: OSSRouteComponent,
});

function OSSRouteComponent() {
  const { q, site } = OSSRoute.useSearch();
  return <OSSExplorer initialQuery={q} initialSite={site} />;
}
