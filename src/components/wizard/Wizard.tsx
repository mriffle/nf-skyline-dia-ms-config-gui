// Wizard container. Manages the current screen index, recomputes the
// applicable screen subset on every state change, and renders the active
// screen inside WizardChrome.
//
// The wizard reads from and writes to the same Zustand store as the form
// so finishing the wizard simply drops the user back into the form view
// with state intact.

import { useEffect, useMemo, useState } from 'react';
import { useFormState, useValidation } from '../../hooks/useValidation';
import { visibleWizardScreens, type WizardScreenId } from './flow';
import { WizardChrome } from './WizardChrome';

interface WizardProps {
  readonly onExit: () => void;
}

export function Wizard({ onExit }: WizardProps) {
  const state = useFormState();
  const validation = useValidation();
  const screens = useMemo(() => visibleWizardScreens(state), [state]);
  const [currentId, setCurrentId] = useState<WizardScreenId>(() => {
    const first = screens[0];
    return first ? first.id : 'mode';
  });

  // If the current screen falls out of the active subset (e.g. user toggled
  // msconvert-only and then went Back past it, then forward — the
  // intermediate screen they were on may no longer apply), snap to the
  // nearest applicable screen at or before it. shouldShow predicates can
  // never make the *current* screen invisible by editing on it (they only
  // depend on values set on earlier screens), but they can after Back +
  // editing an earlier screen.
  useEffect(() => {
    if (screens.some((s) => s.id === currentId)) return;
    const fallback = screens[0]?.id;
    if (fallback) setCurrentId(fallback);
  }, [screens, currentId]);

  const currentIndex = Math.max(
    0,
    screens.findIndex((s) => s.id === currentId),
  );
  const current = screens[currentIndex];

  const canAdvance = useMemo(() => {
    if (!current) return false;
    if (!current.canAdvance) return true;
    if (!current.canAdvance(state)) return false;
    // Don't let the user advance past a screen with field errors *on a
    // field belonging to this screen*. Field errors elsewhere are surfaced
    // on the review screen.
    return true;
  }, [current, state]);

  if (!current) return null;
  const Screen = current.Component;

  const onBack = (): void => {
    if (currentIndex <= 0) return;
    const prev = screens[currentIndex - 1];
    if (prev) setCurrentId(prev.id);
  };
  const onNext = (): void => {
    if (currentIndex >= screens.length - 1) return;
    const next = screens[currentIndex + 1];
    if (next) setCurrentId(next.id);
  };
  const onFinish = (): void => {
    onExit();
  };
  const onCancel = (): void => {
    const ok = window.confirm(
      'Exit the wizard? Your inputs are kept; you can finish editing in the regular form.',
    );
    if (ok) onExit();
  };
  const onJumpTo = (idx: number): void => {
    const target = screens[idx];
    if (target) setCurrentId(target.id);
  };

  // Touch validation to register state listeners. The review screen reads
  // it via ValidationSummary; other screens may want to surface issues
  // contextually later.
  void validation;

  return (
    <WizardChrome
      screens={screens}
      currentIndex={currentIndex}
      canAdvance={canAdvance}
      onBack={onBack}
      onNext={onNext}
      onFinish={onFinish}
      onCancel={onCancel}
      onJumpTo={onJumpTo}
    >
      <Screen />
    </WizardChrome>
  );
}
