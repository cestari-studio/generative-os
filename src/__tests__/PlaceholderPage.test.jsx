/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, test } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithoutProviders } from '../test/test-utils';
import Placeholder from '../pages/placeholder/Placeholder';

describe('registered but unimplemented route state', () => {
  test('explains implementation status without demonstrating navigation or inventing content', () => {
    renderWithoutProviders(
      <MemoryRouter initialEntries={['/master/private/finops']}>
        <Placeholder />
      </MemoryRouter>,
    );

    expect(screen.getByText('Route not implemented')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This route is registered, but its functional page implementation is not available in this build.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No sample, demo, or placeholder records are displayed on this route.'),
    ).toBeInTheDocument();
    expect(screen.getByText("The registered route is '/master/private/finops'.")).toBeInTheDocument();
    expect(screen.queryByText(/demonstrate the global navigation|generally not a good idea/i)).not.toBeInTheDocument();
  });
});
