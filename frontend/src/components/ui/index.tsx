/**
 * Finality Labs - UI Components
 * Base components built with Radix UI primitives
 */

'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

// Import extended components
import {
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
} from './extended';

// ============================================
// Button
// ============================================

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', loading, children, disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 disabled:pointer-events-none';
    
    const variants = {
      default: 'bg-black text-white border-black hover:bg-[#2b2b2b] border',
      secondary: 'bg-transparent text-black border-black hover:bg-black/5 border',
      outline: 'bg-transparent text-black border border-[#333333]/30 hover:bg-black/5',
      ghost: 'bg-transparent text-[#5d5d5d] hover:bg-black/5 border-transparent',
      danger: 'bg-[#e03e3e] text-white border-[#e03e3e] hover:bg-[#c92a2a] border',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs gap-1.5',
      md: 'px-4 py-2 text-sm gap-2',
      lg: 'px-6 py-3 text-base gap-2',
    };

    return (
      <ButtonPrimitive
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </ButtonPrimitive>
    );
  }
);

Button.displayName = 'Button';

const ButtonPrimitive = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => (
    <button ref={ref} className={cn(className)} {...props}>
      {children}
    </button>
  )
);

ButtonPrimitive.displayName = 'ButtonPrimitive';

// ============================================
// Input
// ============================================

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const inputId = id || React.useId();
    const errorId = error ? `${inputId}-error` : undefined;
    const helperId = helperText ? `${inputId}-helper` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="text-xs uppercase tracking-wider text-[#5d5d5d] mb-1.5 block">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full border border-[#333333]/30 bg-white/84 text-[#151515] px-3 py-2 text-sm outline-none transition-all duration-150',
            'focus:border-black focus:bg-white focus:ring-1 focus:ring-black',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'border-[#e03e3e] focus:border-[#e03e3e] focus:ring-[#e03e3e]',
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={cn(errorId, helperId)}
          {...props}
        />
        {error && (
          <p id={errorId} className="mt-1.5 text-xs text-[#e03e3e]" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="mt-1.5 text-xs text-[#5d5d5d]">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// ============================================
// Textarea
// ============================================

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const inputId = id || React.useId();
    const errorId = error ? `${inputId}-error` : undefined;
    const helperId = helperText ? `${inputId}-helper` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="text-xs uppercase tracking-wider text-[#5d5d5d] mb-1.5 block">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            'w-full border border-[#333333]/30 bg-white/84 text-[#151515] px-3 py-2 text-sm outline-none transition-all duration-150 resize-y min-h-[80px]',
            'focus:border-black focus:bg-white focus:ring-1 focus:ring-black',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'border-[#e03e3e] focus:border-[#e03e3e] focus:ring-[#e03e3e]',
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={cn(errorId, helperId)}
          {...props}
        />
        {error && (
          <p id={errorId} className="mt-1.5 text-xs text-[#e03e3e]" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="mt-1.5 text-xs text-[#5d5d5d]">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

// ============================================
// Select
// ============================================

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  onChange?: React.ChangeEventHandler<HTMLSelectElement> | ((value: string) => void);
  disabled?: boolean;
  className?: string;
  id?: string;
  children?: React.ReactNode;
}

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  ({ className, label, error, helperText, options, placeholder, value, onValueChange, onChange, disabled, id, children, ...props }, ref) => {
    const selectId = id || React.useId();
    const errorId = error ? `${selectId}-error` : undefined;
    const helperId = helperText ? `${selectId}-helper` : undefined;
    const [selectedValue, setSelectedValue] = React.useState(value || '');

    React.useEffect(() => {
  if (value !== undefined) {
    setSelectedValue(value);
  }
}, [value]);

    const handleValueChange = (newValue: string) => {
  setSelectedValue(newValue);

  onValueChange?.(newValue);

  if (onChange) {
    const syntheticEvent = {
      target: {
        value: newValue,
        name: selectId,
      },
    } as React.ChangeEvent<HTMLSelectElement>;

    (onChange as React.ChangeEventHandler<HTMLSelectElement>)(syntheticEvent);
  }
};

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="text-xs uppercase tracking-wider text-[#5d5d5d] mb-1.5 block">
            {label}
          </label>
        )}
        <SelectPrimitive.Root
  value={value ?? selectedValue}
  onValueChange={handleValueChange}
>
          <SelectPrimitive.Trigger
            ref={ref}
            id={selectId}
            className={cn(
              'w-full border border-[#333333]/30 bg-white text-black px-3 py-2 text-sm outline-none transition-all duration-150',
              'focus:border-black focus:bg-white focus:ring-1 focus:ring-black',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'flex items-center justify-between',
              error && 'border-[#e03e3e] focus:border-[#e03e3e] focus:ring-[#e03e3e]',
              className
            )}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={cn(errorId, helperId)}
          >
            <SelectPrimitive.Value
    placeholder={placeholder}
    className="text-white"
/>
            <SelectPrimitive.Icon>
              <ChevronDown className="h-4 w-4 text-[#5d5d5d]" />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>
          <SelectPrimitive.Portal>
            <SelectPrimitive.Content className="relative z-50 max-h-96 overflow-auto bg-white border border-[#333333]/30 shadow-[0_18px_50px_rgba(0,0,0,.06)]">
              <SelectPrimitive.Viewport>
                {options.map((option) => (
                  <SelectPrimitive.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className={cn(
                      'relative flex w-full cursor-default select-none items-center rounded-none py-2 px-3 text-sm outline-none',
                      'data-[highlighted]:bg-black/5 data-[highlighted]:text-black',
                      'data-[disabled]:opacity-50 data-[disabled]:pointer-events-none',
                      'focus:bg-black/5 focus:text-black'
                    )}
                  >
                    <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator>
                      <Check className="h-4 w-4 text-black" />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
        {error && (
          <p id={errorId} className="mt-1.5 text-xs text-[#e03e3e]" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="mt-1.5 text-xs text-[#5d5d5d]">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

// ============================================
// Card
// ============================================

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'border border-[#333333]/14 bg-white/72 backdrop-blur-[16px] shadow-[0_18px_50px_rgba(0,0,0,.06)]',
        'animate-fade-in animate-slide-up',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);

Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('p-4 pb-0', className)} {...props}>
      {children}
    </div>
  )
);

CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn('font-serif text-2xl font-normal leading-[1] tracking-[-0.02em]', className)}
      {...props}
    >
      {children}
    </h2>
  )
);

CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => (
    <p ref={ref} className={cn('text-[#5d5d5d] text-sm leading-relaxed mt-2', className)} {...props}>
      {children}
    </p>
  )
);

CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('p-4 pt-0', className)} {...props}>
      {children}
    </div>
  )
);

CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-4 pt-0', className)} {...props}>
      {children}
    </div>
  )
);

CardFooter.displayName = 'CardFooter';

// ============================================
// Badge
// ============================================

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error';
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const variants = {
      default: 'border-[#333333]/30 bg-white/70 text-[#151515]',
      success: 'bg-[#3fb950]/10 border-[#3fb950] text-[#3fb950]',
      warning: 'bg-[#f5a623]/10 border-[#f5a623] text-[#f5a623]',
      error: 'bg-[#e03e3e]/10 border-[#e03e3e] text-[#e03e3e]',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs uppercase tracking-wider border',
          variants[variant],
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

// ============================================
// Status Badge
// ============================================

interface StatusBadgeProps {
  status: 'idle' | 'connecting' | 'active' | 'success' | 'warning' | 'error' | 'closed';
  label: string;
  pulsing?: boolean;
}

const StatusBadge = ({ status, label, pulsing }: StatusBadgeProps) => {
  const statusConfig = {
    idle: { dotColor: 'bg-black', bg: 'bg-white/70', border: 'border-[#333333]/30', text: 'text-black' },
    connecting: { dotColor: 'bg-[#f5a623]', bg: 'bg-[#f5a623]/10', border: 'border-[#f5a623]', text: 'text-[#f5a623]' },
    active: { dotColor: 'bg-black animate-pulse', bg: 'bg-black/5', border: 'border-black', text: 'text-black' },
    success: { dotColor: 'bg-[#3fb950]', bg: 'bg-[#3fb950]/10', border: 'border-[#3fb950]', text: 'text-[#3fb950]' },
    warning: { dotColor: 'bg-[#f5a623]', bg: 'bg-[#f5a623]/10', border: 'border-[#f5a623]', text: 'text-[#f5a623]' },
    error: { dotColor: 'bg-[#e03e3e]', bg: 'bg-[#e03e3e]/10', border: 'border-[#e03e3e]', text: 'text-[#e03e3e]' },
    closed: { dotColor: 'bg-[#5d5d5d]', bg: 'bg-white/70', border: 'border-[#333333]/30', text: 'text-[#5d5d5d]' },
  };

  const config = statusConfig[status];

  return (
    <span className={cn(
      'inline-flex items-center gap-2 px-3 py-1.5 border text-xs uppercase tracking-wider',
      config.bg, config.border, config.text,
    )}>
      <span className={cn('w-2 h-2 rounded-full', config.dotColor, pulsing && 'animate-pulse')} />
      {label}
    </span>
  );
};

// ============================================
// Avatar
// ============================================

import * as AvatarPrimitive from '@radix-ui/react-avatar';

export const Avatar = AvatarPrimitive.Root;
export const AvatarImage = AvatarPrimitive.Image;
export const AvatarFallback = AvatarPrimitive.Fallback;

// ============================================
// Separator
// ============================================

import * as SeparatorPrimitive from '@radix-ui/react-separator';

const Separator = React.forwardRef<HTMLDivElement, SeparatorPrimitive.SeparatorProps>(
  ({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-[#333333]/14',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className
      )}
      {...props}
    />
  )
);

Separator.displayName = 'Separator';

// ============================================
// ScrollArea
// ============================================

import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaPrimitive.ScrollAreaProps>(
  ({ className, children, ...props }, ref) => (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar orientation="vertical" className="flex h-full w-2.5 border-l border-[#333333]/14 p-1">
        <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-[#333333]/30 hover:bg-[#333333]/50 transition-colors" />
      </ScrollAreaPrimitive.Scrollbar> 
      <ScrollAreaPrimitive.Scrollbar orientation="horizontal" className="flex h-2.5 w-full border-t border-[#333333]/14 p-1">
        <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-[#333333]/30 hover:bg-[#333333]/50 transition-colors" />
      </ScrollAreaPrimitive.Scrollbar>
    </ScrollAreaPrimitive.Root>
  )
);

ScrollArea.displayName = 'ScrollArea';

// ============================================
// Toast (using sonner)
// ============================================

import { Toaster as SonnerToaster, toast as sonnerToast, type ExternalToast } from 'sonner';

type ToastOptions = ExternalToast;

const Toaster = ({ ...props }: React.ComponentPropsWithoutRef<typeof SonnerToaster>) => (
  <SonnerToaster
    theme="light"
    className="toaster"
    toastOptions={{
      classNames: {
        toast: 'bg-white/95 backdrop-blur border border-[#333333]/14 shadow-[0_18px_50px_rgba(0,0,0,.06)]',
        description: 'text-[#5d5d5d]',
        actionButton: 'bg-black text-white hover:bg-[#2b2b2b]',
        cancelButton: 'bg-transparent text-black hover:bg-black/5 border border-[#333333]/30',
      },
    }}
    {...props}
  />
);

const toast = {
  success: (message: string, options?: ToastOptions) => sonnerToast.success(message, options),
  error: (message: string, options?: ToastOptions) => sonnerToast.error(message, options),
  info: (message: string, options?: ToastOptions) => sonnerToast.info(message, options),
  warning: (message: string, options?: ToastOptions) => sonnerToast.warning(message, options),
  promise: <T,>(
    promise: Promise<T>,
    messages: { loading: string; success: string | ((data: T) => string); error: string | ((error: unknown) => string) },
    options?: ToastOptions
  ) => sonnerToast.promise(promise, { loading: messages.loading, success: messages.success, error: messages.error, ...options }),
  dismiss: (toastId?: string) => sonnerToast.dismiss(toastId),
};

// ============================================
// Loading Spinner
// ============================================

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const Spinner = ({ size = 'md', className }: SpinnerProps) => {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <svg className={cn('animate-spin text-black', sizes[size], className)} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
};

// ============================================
// Empty State
// ============================================

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    {icon && <div className="mb-4 text-[#5d5d5d]/50">{icon}</div>}
    <h3 className="text-lg font-medium text-[#151515] mb-2">{title}</h3>
    {description && <p className="text-[#5d5d5d] text-sm max-w-sm mb-4">{description}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

// ============================================
// Table
// ============================================

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {}

const TableRoot = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, children, ...props }, ref) => (
    <div className="overflow-x-auto">
      <table
        ref={ref}
        className={cn('w-full border-collapse text-sm', className)}
        {...props}
      >
        {children}
      </table>
    </div>
  )
);

TableRoot.displayName = 'Table';

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, children, ...props }, ref) => (
    <thead ref={ref} className={cn('[&_tr]:border-b border-[#333333]/14', className)} {...props}>
      {children}
    </thead>
  )
);

TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, children, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props}>
      {children}
    </tbody>
  )
);

TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, children, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn('border-b border-[#333333]/14 hover:bg-black/[0.02] transition-colors', className)}
      {...props}
    >
      {children}
    </tr>
  )
);

TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, children, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'text-left px-3 py-2.5 font-medium text-xs uppercase tracking-wider text-[#5d5d5d]',
        className
      )}
      {...props}
    >
      {children}
    </th>
  )
);

TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, children, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('px-3 py-2.5 text-[#151515]', className)}
      {...props}
    >
      {children}
    </td>
  )
);

TableCell.displayName = 'TableCell';

// Create compound component
const TableCompound = TableRoot as typeof TableRoot & {
  Header: typeof TableHeader;
  Body: typeof TableBody;
  Row: typeof TableRow;
  Head: typeof TableHead;
  Cell: typeof TableCell;
};

TableCompound.Header = TableHeader;
TableCompound.Body = TableBody;
TableCompound.Row = TableRow;
TableCompound.Head = TableHead;
TableCompound.Cell = TableCell;

// Export the compound component as Table
export { TableCompound as Table };

// ============================================
// Skeleton
// ============================================

const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('animate-pulse rounded bg-[#333333]/14', className)}
      {...props}
    />
  )
);

Skeleton.displayName = 'Skeleton';

// ============================================
// Exports
// ============================================
export {
  Button,
  Input,
  Textarea,
  Select,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  StatusBadge,
  VerificationStatusBadge,
  Separator,
  ScrollArea,
  Toaster,
  toast,
  Spinner,
  EmptyState,
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
  Skeleton,
};