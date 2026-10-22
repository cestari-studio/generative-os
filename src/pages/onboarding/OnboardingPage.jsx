/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useTenant } from '../../context/useTenant';

export const OnboardingPage = () => {
  const navigate = useNavigate();
  const { openOnboardingFlow } = useTenant();

  useEffect(() => {
    openOnboardingFlow(0);
    navigate('/dashboard', { replace: true });
  }, [openOnboardingFlow, navigate]);

  return null;
};

export default OnboardingPage;
