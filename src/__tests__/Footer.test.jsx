/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { test, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderWithoutProviders } from '../test/test-utils';
import { Footer } from '../components/footer/Footer';
import { server } from '../test/server';
import { setupBeforeAll, setupBeforeEach, setupAfterEach, setupAfterAll } from '../test/setup';

beforeAll(() => setupBeforeAll(server));
beforeEach(() => setupBeforeEach(server));
afterEach(() => setupAfterEach(server));
afterAll(() => setupAfterAll(server));

test('renders Footer with Cestari Studio copyright, evaluation link, and product disclaimer', () => {
  renderWithoutProviders(<Footer />);

  const currentYear = new Date().getFullYear();

  // 1. Evaluation notice with link to cestari.studio/genos
  const linkElement = screen.getByRole('link', { name: /cestari\.studio\/genos/i });
  expect(linkElement).toBeInTheDocument();
  expect(linkElement).toHaveAttribute('href', 'https://cestari.studio/genos');
  expect(linkElement).toHaveAttribute('target', '_blank');
  expect(linkElement).toHaveAttribute('rel', 'noopener noreferrer');

  // 2. Subscription & open-source evaluation disclaimer
  expect(
    screen.getByText(
      /A subscription is required for all software products available under Generative Operating System/i,
    ),
  ).toBeInTheDocument();
  expect(screen.getByText(/IBM AI Nexus Atlas and IBM Granite Model/i)).toBeInTheDocument();

  // 3. Dynamic copyright with current year and Cestari Studio Inc.
  const copyrightPattern = new RegExp(`Copyright © ${currentYear} Cestari Studio Inc\\.`, 'i');
  expect(screen.getByText(copyrightPattern)).toBeInTheDocument();
});
