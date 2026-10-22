'use client';

import { Camera } from 'lucide-react';
import ProgressIndicator from '../ui/ProgressIndicator';

interface HeaderProps {
  step?: number;
  totalSteps?: number;
  headerLeftElement?: React.ReactNode;
}

const STEP_LABELS = [
  'Kode',
  'Aturan',
  'Template',
  'Kamera',
  'Edit',
  'Kirim',
  'Selesai',
];

export default function Header({ step = 0, totalSteps = 7, headerLeftElement }: HeaderProps) {
  return (
    <header className="flex flex-col gap-2 px-4 py-3 shrink-0 sm:flex-row sm:items-center sm:justify-between sm:px-8">
      {/* Logo area */}
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center">
          <img src="/assets/logo/logo.png" alt="Sesijepret Logo" className="w-auto h-12 object-contain" />
        </div>
        {headerLeftElement}
      </div>

      {/* Progress indicator — only shown when in a flow step */}
      {step > 0 && (
        <ProgressIndicator
          currentStep={step}
          totalSteps={totalSteps}
          labels={STEP_LABELS}
        />
      )}

      {/* Right spacer / future: session timer */}
      <div className="hidden w-[120px] justify-end sm:flex">
        <span className="text-xs text-black/50 font-medium">Sesijepret Photo Booth</span>
      </div>
    </header>
  );
}
