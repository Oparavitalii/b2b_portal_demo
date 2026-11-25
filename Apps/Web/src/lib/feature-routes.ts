import type { RouteObject } from 'react-router-dom';

// Feature routing without stubs: every `features/<name>/routes.tsx` may export
// `publicRoutes`, `customerRoutes` and `adminRoutes`. A feature that does not
// exist yet simply contributes nothing.
export interface FeatureRoutesModule {
  publicRoutes?: RouteObject[];
  customerRoutes?: RouteObject[];
  adminRoutes?: RouteObject[];
}

const modules = import.meta.glob<FeatureRoutesModule>(
  '../features/*/routes.tsx',
  {
    eager: true,
  },
);

// Sorted by file path so the route order is deterministic across builds.
const loaded: FeatureRoutesModule[] = Object.keys(modules)
  .sort()
  .map((key) => modules[key])
  .filter((mod): mod is FeatureRoutesModule => mod !== undefined);

function collect(key: keyof FeatureRoutesModule): RouteObject[] {
  return loaded.flatMap((mod) => {
    const routes = mod[key];
    return Array.isArray(routes) ? routes : [];
  });
}

export const featureRoutes = {
  public: collect('publicRoutes'),
  customer: collect('customerRoutes'),
  admin: collect('adminRoutes'),
};
