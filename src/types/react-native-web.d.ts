// react-native-web ships no bundled types; we import exactly one export
// (the DateField.web/TimeField.web HTML-input escape hatch), so declare
// just that instead of pulling in @types/react-native-web.
declare module 'react-native-web' {
  import type { ReactElement } from 'react';

  export function unstable_createElement(
    type: string,
    props?: Record<string, unknown>,
  ): ReactElement;
}
