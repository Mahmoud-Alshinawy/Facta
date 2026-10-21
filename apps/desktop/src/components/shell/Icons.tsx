// The stroke icons the boards draw inline. Decorative: always aria-hidden,
// the control around them carries the name.

import type { ReactNode } from "react";

interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

function svg(children: ReactNode, { size = 16, stroke = 2, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  );
}

export const IconToday = (p: IconProps) => svg(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>, p);
export const IconCalendar = (p: IconProps) => svg(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>, p);
export const IconGoals = (p: IconProps) => svg(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>, p);
export const IconNotes = (p: IconProps) => svg(<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>, p);
export const IconDiary = (p: IconProps) => svg(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z" /><path d="M9 8h7" /></>, p);
export const IconSettings = (p: IconProps) => svg(<><path d="M20 7h-9M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></>, p);
export const IconSearch = (p: IconProps) => svg(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>, p);
export const IconLeft = (p: IconProps) => svg(<path d="m15 18-6-6 6-6" />, { stroke: 2.2, ...p });
export const IconRight = (p: IconProps) => svg(<path d="m9 18 6-6-6-6" />, { stroke: 2.2, ...p });
export const IconDown = (p: IconProps) => svg(<path d="m6 9 6 6 6-6" />, { stroke: 2.2, ...p });
export const IconPlus = (p: IconProps) => svg(<path d="M5 12h14M12 5v14" />, { stroke: 2.4, ...p });
export const IconClose = (p: IconProps) => svg(<path d="M18 6 6 18M6 6l12 12" />, { stroke: 2.2, ...p });
export const IconCheck = (p: IconProps) => svg(<path d="M20 6 9 17l-5-5" />, { stroke: 3.4, ...p });
export const IconArrow = (p: IconProps & { className?: string }) => svg(<path d="M5 12h14M13 6l6 6-6 6" />, { stroke: 2.4, ...p });
export const IconWarn = (p: IconProps) => svg(<><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>, { stroke: 2.2, ...p });
export const IconClock = (p: IconProps) => svg(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>, p);
export const IconRepeat = (p: IconProps) => svg(<><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>, p);
export const IconEdit = (p: IconProps) => svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>, p);
export const IconTrash = (p: IconProps) => svg(<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />, p);
export const IconBell = (p: IconProps) => svg(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>, p);
export const IconFlame = (p: IconProps) => svg(<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" />, p);
export const IconPeople = (p: IconProps) => svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>, p);
export const IconMonitor = (p: IconProps) => svg(<><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>, p);
export const IconReset = (p: IconProps) => svg(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>, p);
export const IconUser = (p: IconProps) => svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>, p);
export const IconSignOut = (p: IconProps) => svg(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>, p);
