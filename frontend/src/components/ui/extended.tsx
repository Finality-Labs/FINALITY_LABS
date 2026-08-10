/**
 * Finality Labs - Additional UI Components
 * Extended components built with Radix UI primitives
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

// ============================================
// Progress
// ============================================

import * as ProgressPrimitive from '@radix-ui/react-progress';

const Progress = React.forwardRef<HTMLDivElement, ProgressPrimitive.ProgressProps>(
  ({ className, value, ...props }, ref) => (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-[#333333]/14', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-black transition-all duration-300"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
);

Progress.displayName = 'Progress';

// ============================================
// Switch
// ============================================

import * as SwitchPrimitive from '@radix-ui/react-switch';

interface SwitchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-black' : 'bg-[#333333]/30',
        className
      )}
      checked={checked}
      onCheckedChange={onCheckedChange}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform',
          'translate-x-0 peer-checked:translate-x-5'
        )}
      />
    </SwitchPrimitive.Root>
  )
);

Switch.displayName = 'Switch';

// ============================================
// Label
// ============================================

import * as LabelPrimitive from '@radix-ui/react-label';

const Label = React.forwardRef<HTMLLabelElement, LabelPrimitive.LabelProps>(
  ({ className, ...props }, ref) => (
    <LabelPrimitive.Root
      ref={ref}
      className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)}
      {...props}
    />
  )
);

Label.displayName = 'Label';

// ============================================
// DropdownMenu
// ============================================

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight, Circle } from 'lucide-react';

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuPrimitive.DropdownMenuContentProps>(
  ({ className, sideOffset = 4, ...props }, ref) => (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[8rem] overflow-hidden rounded-none border border-[#333333]/30 bg-white p-1 text-[#151515] shadow-[0_18px_50px_rgba(0,0,0,.06)]',
          'animate-scale-in animate-fade-in',
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
);

DropdownMenuContent.displayName = 'DropdownMenuContent';

const DropdownMenuItem = React.forwardRef<HTMLDivElement, DropdownMenuPrimitive.DropdownMenuItemProps>(
  ({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-none px-2 py-1.5 text-sm outline-none transition-colors',
        'focus:bg-black/5 focus:text-black data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    />
  )
);

DropdownMenuItem.displayName = 'DropdownMenuItem';

const DropdownMenuCheckboxItem = React.forwardRef<HTMLDivElement, DropdownMenuPrimitive.DropdownMenuCheckboxItemProps>(
  ({ className, children, checked, ...props }, ref) => (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-none py-1.5 pl-8 pr-2 text-sm outline-none transition-colors',
        'focus:bg-black/5 focus:text-black data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="h-4 w-4 text-black" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
);

DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem';

const DropdownMenuRadioItem = React.forwardRef<HTMLDivElement, DropdownMenuPrimitive.DropdownMenuRadioItemProps>(
  ({ className, children, ...props }, ref) => (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-none py-1.5 pl-8 pr-2 text-sm outline-none transition-colors',
        'focus:bg-black/5 focus:text-black data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle className="h-2 w-2 fill-black" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
);

DropdownMenuRadioItem.displayName = 'DropdownMenuRadioItem';

const DropdownMenuLabel = React.forwardRef<HTMLDivElement, DropdownMenuPrimitive.DropdownMenuLabelProps>(
  ({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn('px-2 py-1.5 text-sm font-medium text-[#5d5d5d]', className)}
      {...props}
    />
  )
);

DropdownMenuLabel.displayName = 'DropdownMenuLabel';

const DropdownMenuSeparator = React.forwardRef<HTMLDivElement, DropdownMenuPrimitive.DropdownMenuSeparatorProps>(
  ({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-[#333333]/14', className)}
      {...props}
    />
  )
);

DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

const DropdownMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ml-auto text-xs tracking-widest opacity-60', className)} {...props} />
);

const DropdownMenuSubTrigger = React.forwardRef<HTMLDivElement, DropdownMenuPrimitive.DropdownMenuSubTriggerProps>(
  ({ className, children, ...props }, ref) => (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(
        'flex cursor-default select-none items-center rounded-none px-2 py-1.5 text-sm outline-none transition-colors',
        'focus:bg-black/5 focus:text-black data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto h-4 w-4" />
    </DropdownMenuPrimitive.SubTrigger>
  )
);

DropdownMenuSubTrigger.displayName = 'DropdownMenuSubTrigger';

const DropdownMenuSubContent = React.forwardRef<HTMLDivElement, DropdownMenuPrimitive.DropdownMenuSubContentProps>(
  ({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      className={cn(
        'z-50 min-w-[8rem] overflow-hidden rounded-none border border-[#333333]/30 bg-white p-1 text-[#151515] shadow-[0_18px_50px_rgba(0,0,0,.06)]',
        'animate-scale-in animate-fade-in',
        className
      )}
      {...props}
    />
  )
);

DropdownMenuSubContent.displayName = 'DropdownMenuSubContent';

// ============================================
// Tabs
// ============================================

import * as TabsPrimitive from '@radix-ui/react-tabs';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<HTMLDivElement, TabsPrimitive.TabsListProps>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-none bg-white/70 p-1 text-[#5d5d5d] shadow-[0_18px_50px_rgba(0,0,0,.06)]',
        className
      )}
      {...props}
    />
  )
);

TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsPrimitive.TabsTriggerProps>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-none px-3 py-1.5 text-sm font-medium transition-all',
        'focus:outline-none focus:bg-black/5 focus:text-black',
        'disabled:pointer-events-none disabled:opacity-50',
        'data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-[0_2px_4px_rgba(0,0,0,.1)]',
        className
      )}
      {...props}
    />
  )
);

TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef<HTMLDivElement, TabsPrimitive.TabsContentProps>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Content
      ref={ref}
      className={cn('mt-2 ring-0 focus:outline-none animate-fade-in animate-slide-up', className)}
      {...props}
    />
  )
);

TabsContent.displayName = 'TabsContent';

// ============================================
// HoverCard
// ============================================

import * as HoverCardPrimitive from '@radix-ui/react-hover-card';

const HoverCard = HoverCardPrimitive.Root;
const HoverCardTrigger = HoverCardPrimitive.Trigger;
const HoverCardContent = HoverCardPrimitive.Content;

// ============================================
// Verification Status Badge
// ============================================

import {
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  HelpCircle,
  Loader2,
} from 'lucide-react';

interface VerificationStatusBadgeProps {
  status: 'pending' | 'seller-completed' | 'waiting-for-buyer' | 'verified' | 'rejected' | 'disputed' | 'error';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

const statusConfig = {
  'pending': {
    label: 'Pending',
    icon: Loader2,
    bg: 'bg-[#f5a623]/10',
    border: 'border-[#f5a623]',
    text: 'text-[#f5a623]',
    iconColor: 'text-[#f5a623]',
    pulse: true,
  },
  'seller-completed': {
    label: 'Seller Completed',
    icon: CheckCircle,
    bg: 'bg-[#3fb950]/10',
    border: 'border-[#3fb950]',
    text: 'text-[#3fb950]',
    iconColor: 'text-[#3fb950]',
    pulse: false,
  },
  'waiting-for-buyer': {
    label: 'Waiting for Buyer',
    icon: Clock,
    bg: 'bg-[#0070f3]/10',
    border: 'border-[#0070f3]',
    text: 'text-[#0070f3]',
    iconColor: 'text-[#0070f3]',
    pulse: true,
  },
  'verified': {
    label: 'Verified',
    icon: CheckCircle,
    bg: 'bg-[#3fb950]/10',
    border: 'border-[#3fb950]',
    text: 'text-[#3fb950]',
    iconColor: 'text-[#3fb950]',
    pulse: false,
  },
  'rejected': {
    label: 'Rejected',
    icon: XCircle,
    bg: 'bg-[#e03e3e]/10',
    border: 'border-[#e03e3e]',
    text: 'text-[#e03e3e]',
    iconColor: 'text-[#e03e3e]',
    pulse: false,
  },
  'disputed': {
    label: 'Disputed',
    icon: AlertCircle,
    bg: 'bg-[#e03e3e]/10',
    border: 'border-[#e03e3e]',
    text: 'text-[#e03e3e]',
    iconColor: 'text-[#e03e3e]',
    pulse: true,
  },
  'error': {
    label: 'Error',
    icon: HelpCircle,
    bg: 'bg-[#5d5d5d]/10',
    border: 'border-[#5d5d5d]',
    text: 'text-[#5d5d5d]',
    iconColor: 'text-[#5d5d5d]',
    pulse: false,
  },
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs gap-1',
  md: 'px-3 py-1 text-sm gap-1.5',
  lg: 'px-4 py-1.5 text-base gap-2',
};

const iconSizes = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

const VerificationStatusBadge = ({
  status,
  size = 'md',
  showIcon = true,
}: VerificationStatusBadgeProps) => {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium uppercase tracking-wider border rounded-lg',
        config.bg,
        config.border,
        config.text,
        sizeStyles[size]
      )}
    >
      {showIcon && (
        <Icon
          className={cn(config.iconColor, iconSizes[size], config.pulse && 'animate-spin')}
          aria-hidden="true"
        />
      )}
      {config.label}
    </span>
  );
};

VerificationStatusBadge.displayName = 'VerificationStatusBadge';

// ============================================
// Exports
// ============================================

export {
  Progress,
  Switch,
  Label,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuRadioGroup,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
  VerificationStatusBadge,
};