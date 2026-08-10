/**
 * Finality Labs - Create Intent/Offer Page
 * Form to create buyer intents and seller offers with ERC-8004 identity support
 */

import { Suspense } from 'react';
import { CreatePageClient } from './CreatePageClient';

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="space-y-6 max-w-4xl mx-auto">Loading...</div>}>
      <CreatePageClient />
    </Suspense>
  );
}