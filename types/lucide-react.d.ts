declare module 'lucide-react' {
  import * as React from 'react';

  export interface LucideProps extends React.SVGProps<SVGSVGElement> {
    size?: number | string;
    color?: string;
    strokeWidth?: number | string;
    absoluteStrokeWidth?: boolean;
  }

  export type LucideIcon = React.ForwardRefExoticComponent<
    LucideProps & React.RefAttributes<SVGSVGElement>
  >;

  export const ArrowLeft: LucideIcon;
  export const Camera: LucideIcon;
  export const Heart: LucideIcon;
  export const Mail: LucideIcon;
  export const Send: LucideIcon;
  export const Sparkles: LucideIcon;
  export const Check: LucideIcon;
  export const RefreshCcw: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const AlertTriangle: LucideIcon;
  export const RotateCcw: LucideIcon;
  export const Image: LucideIcon;
  export const Download: LucideIcon;
  export const Printer: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const XCircle: LucideIcon;
  export const Clock: LucideIcon;
  export const KeyRound: LucideIcon;
  export const Scissors: LucideIcon;
  export const MailX: LucideIcon;
  export const MailCheck: LucideIcon;
  export const X: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const ChevronLeft: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const Plus: LucideIcon;
  export const Trash2: LucideIcon;
  export const Copy: LucideIcon;
  export const Eye: LucideIcon;
}
