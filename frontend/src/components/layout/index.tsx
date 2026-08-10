/**
 * Finality Labs - Layout Components
 * Main layout components for the application
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  PlusCircle,
  Handshake,
  FileText,
  BarChart3,
  Settings,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Bell,
  User,
  LogOut,
  Shield,
  Activity,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Button,
  Avatar,
  AvatarImage,
  AvatarFallback,
  Separator,
  ScrollArea,
} from '@/components/ui';

// ============================================
// Navigation Item
// ============================================

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  disabled?: boolean;
}

const NavItem = ({ href, label, icon, badge, disabled }: NavItemProps) => {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-150 rounded-none',
        'hover:bg-black/5',
        isActive
          ? 'bg-black/5 text-black border-l-4 border-black'
          : 'text-[#5d5d5d] hover:text-black',
        disabled && 'opacity-50 pointer-events-none'
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      <span className={cn('flex-shrink-0 h-5 w-5', isActive && 'text-black')}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className="flex-shrink-0 px-2 py-0.5 text-xs bg-black/10 text-black rounded-full">
          {badge}
        </span>
      )}
    </Link>
  );
};

// ============================================
// Sidebar
// ============================================

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

const navigation = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/create', label: 'Create Intent/Offer', icon: PlusCircle },
  { href: '/register-agent', label: 'Register Agent', icon: Shield },
  { href: '/negotiations', label: 'Negotiations', icon: Handshake },
  { href: '/verification', label: 'Verification', icon: Shield },
  { href: '/history', label: 'Transaction History', icon: History },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/reputation', label: 'Reputation', icon: Shield },
  { href: '/activity', label: 'Live Activity', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export const Sidebar = ({ collapsed = false, onToggle }: SidebarProps) => {
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 lg:hidden',
          isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setIsMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static z-50 lg:z-auto h-full lg:h-screen flex flex-col bg-white/80 backdrop-blur-[16px] border-r border-[#333333]/14 transition-all duration-300 ease-out',
          collapsed ? 'w-16' : 'w-64',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-label="Main navigation"
      >
        {/* Header */}
        <div className={cn('flex items-center justify-between h-16 px-4 border-b border-[#333333]/14', collapsed && 'justify-center')}>
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="h-8 w-8 bg-black rounded-lg flex items-center justify-center">
                <span className="text-white font-serif text-xl">F</span>
              </div>
              <span className="font-serif text-xl font-medium text-black">Finality</span>
            </Link>
          )}
          {collapsed && (
            <Link href="/dashboard" className="flex items-center justify-center" aria-label="Finality Labs">
              <div className="h-8 w-8 bg-black rounded-lg flex items-center justify-center">
                <span className="text-white font-serif text-xl">F</span>
              </div>
            </Link>
          )}
          <button
            onClick={onToggle}
            className={cn(
              'lg:hidden p-1.5 rounded hover:bg-black/5 transition-colors',
              collapsed && 'hidden'
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2" aria-label="Navigation">
          <ScrollArea className="h-full">
            <div className="space-y-1">
              {navigation.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={<item.icon className="h-5 w-5" />}
                />
              ))}
            </div>
          </ScrollArea>
        </nav>

        {/* Footer */}
        <div className={cn('p-4 border-t border-[#333333]/14', collapsed && 'px-2')}>
          {!collapsed && (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
  <AvatarImage src="/avatar.png" alt="User" />
  <AvatarFallback>U</AvatarFallback>
</Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-black truncate">User Name</p>
                <p className="text-xs text-[#5d5d5d] truncate">user@finality.io</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="flex justify-center">
              <Avatar className="h-8 w-8">
  <AvatarImage src="/avatar.png" alt="User" />
  <AvatarFallback>U</AvatarFallback>
</Avatar>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

// ============================================
// Header
// ============================================

interface HeaderProps {
  onMenuClick?: () => void;
  onSidebarToggle?: () => void;
  sidebarCollapsed?: boolean;
}

export const Header = ({ onMenuClick, onSidebarToggle, sidebarCollapsed }: HeaderProps) => {
  const pathname = usePathname();
  const pageTitles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/create': 'Create Intent/Offer',
    '/register-agent': 'Register Agent',
    '/negotiations': 'Negotiations',
    '/verification': 'Verification Dashboard',
    '/history': 'Transaction History',
    '/analytics': 'Analytics',
    '/reputation': 'Reputation',
    '/activity': 'Live Activity',
    '/settings': 'Settings',
  };

  const getPageTitle = (path: string) => {
    for (const [key, value] of Object.entries(pageTitles)) {
      if (path === key || (key !== '/' && path.startsWith(key))) {
        return value;
      }
    }
    return 'Finality Labs';
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/80 backdrop-blur-[16px] border-b border-[#333333]/14">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        {/* Left side - Menu toggle + Page title */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-1.5 rounded hover:bg-black/5 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={onSidebarToggle}
            className="hidden lg:flex p-1.5 rounded hover:bg-black/5 transition-colors"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
          <h1 className="text-lg font-medium text-black hidden sm:block">
            {getPageTitle(pathname)}
          </h1>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <button className="relative p-2 rounded hover:bg-black/5 transition-colors" aria-label="Notifications">
            <Bell className="h-5 w-5 text-[#5d5d5d]" />
            <span className="absolute top-1 right-1 h-2 w-2 bg-[#e03e3e] rounded-full" />
          </button>

          {/* User menu */}
          <div className="relative">
            <button className="flex items-center gap-2 p-1.5 rounded hover:bg-black/5 transition-colors" aria-label="User menu">
              <Avatar className="h-8 w-8">
  <AvatarImage src="/avatar.png" alt="User" />
  <AvatarFallback>U</AvatarFallback>
</Avatar>
              <span className="hidden md:block text-sm font-medium text-black">User Name</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

// ============================================
// Main Layout
// ============================================

interface MainLayoutProps {
  children: React.ReactNode;
  sidebarCollapsed?: boolean;
}

export const MainLayout = ({ children, sidebarCollapsed = false }: MainLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(sidebarCollapsed);

  const toggleSidebar = () => setCollapsed((prev) => !prev);
  const openMobileSidebar = () => setSidebarOpen(true);
  const closeMobileSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-[#f4f3ef]">
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleSidebar}
      />
      <div className={cn('lg:pl-64 transition-all duration-300', collapsed && 'lg:pl-16')}>
        <Header
          onMenuClick={openMobileSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={collapsed}
        />
        <main className="p-4 lg:p-6 pb-8">
          <div className="max-w-[1500px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

// ============================================
// Page Container
// ============================================

interface PageContainerProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export const PageContainer = ({ title, description, action, children, className }: PageContainerProps) => (
  <div className={cn('animate-fade-in animate-slide-up', className)}>
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-normal leading-tight tracking-tight text-black">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-[#5d5d5d] text-base">{description}</p>
        )}
      </div>
      {action && <div className="mt-4 sm:mt-0 flex-shrink-0">{action}</div>}
    </div>
    <div>{children}</div>
  </div>
);

// ============================================
// Section
// ============================================

interface SectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export const Section = ({ title, description, children, className, action }: SectionProps) => (
  <section className={cn('space-y-4', className)}>
    {(title || action) && (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          {title && <h2 className="font-serif text-xl font-normal text-black">{title}</h2>}
          {description && <p className="text-[#5d5d5d] text-sm mt-1">{description}</p>}
        </div>
        {action && <div className="mt-3 sm:mt-0">{action}</div>}
      </div>
    )}
    <div>{children}</div>
  </section>
);