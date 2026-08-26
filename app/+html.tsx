import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

// Web-only root HTML shell for static rendering (runs in Node, no DOM access).
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="description" content="Stridetail — run your pet-care business, not your paperwork." />
        <meta property="og:site_name" content="Stridetail" />
        <meta property="og:title" content="Stridetail" />
        <meta
          property="og:description"
          content="Run your pet-care business, not your paperwork."
        />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://stridetail.app/og-card.png" />
        <meta name="twitter:card" content="summary" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
