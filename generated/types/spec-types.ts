/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

// GENERATED FILE — DO NOT HAND-EDIT. Regenerate: npm run spec:generate
// Generator 1.0.0; sources: 27 specs.

export type person_birth_date = string;
export type person_full_name = string;
export type person_tax_id = string;

export interface onboarding_personJourneySteps {
  'onboarding.person.identity': { required_for_dashboard: true };
  'onboarding.person.address': { required_for_dashboard: true };
  'onboarding.person.workspace-security': { required_for_dashboard: false };
}
