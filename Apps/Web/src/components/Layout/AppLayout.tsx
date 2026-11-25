import { Center, Loader } from '@mantine/core';
import { Suspense } from 'react';
import { Outlet, ScrollRestoration } from 'react-router-dom';

import classes from './Layout.module.css';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

export function AppLayout() {
  return (
    <div className={classes.shell}>
      <SiteHeader />
      <main id='tresc' className={classes.main}>
        <Suspense
          fallback={
            <Center mih='40vh'>
              <Loader color='cdmInk.9' />
            </Center>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <SiteFooter />
      <ScrollRestoration />
    </div>
  );
}
