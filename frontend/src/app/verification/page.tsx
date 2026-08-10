/**
 * Finality Labs - Verification Page
 * Main page for the Verification Dashboard
 */

'use client';

import * as React from 'react';
import { MainLayout, Sidebar, Header, PageContainer } from '@/components/layout';
import { VerificationDashboard } from '@/components/verification';

export default function VerificationPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  return (
    <MainLayout sidebarCollapsed={sidebarCollapsed}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <Header onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)} sidebarCollapsed={sidebarCollapsed} />
      <main className="p-4 lg:p-6 pb-8">
        <div className="max-w-[1500px] mx-auto">
          <PageContainer
            title="Verification Dashboard"
            description="Monitor and manage verification requests across all deals"
          >
            <VerificationDashboard
              currentUserRole="buyer"
              currentUserAgentId="current-agent"
            />
          </PageContainer>
        </div>
      </main>
    </MainLayout>
  );
}