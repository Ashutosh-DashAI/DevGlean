import { createRoute, redirect } from '@tanstack/react-router';
import { Root } from './__root';
import { Search } from '../pages/search/Search';
import { z } from 'zod';

export const SearchRoute = createRoute({
  getParentRoute: () => Root,
  path: '/search',
  validateSearch: z.object({
    q: z.string().optional(),
    surface: z.enum(['private', 'oss', 'both']).optional().default('both'),
    issue: z.string().optional(),
  }),
  component: SearchRouteComponent,
});

function SearchRouteComponent() {
  const { q, surface, issue } = SearchRoute.useSearch();
  return <Search initialQuery={q} initialSurface={surface} initialIssue={issue} />;
}
