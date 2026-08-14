/**
 * Finality Labs - Verification Action Buttons Component
 * Provides Seller and Buyer actions for verification workflow
 */

'use client';

import * as React from 'react';
import {
  CheckCircle,
  XCircle,
  FileText,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Input,
  Textarea,
  Badge,
  VerificationStatusBadge,
  Separator,
} from '@/components/ui';
import {
  useSubmitSellerCompletion,
  useSubmitBuyerDecision,
  useSubmitAdminOverride,
} from '@/lib/queries';
import type { VerificationResult, VerificationStatus } from '@/types/verification';
import { toast } from 'sonner';

interface VerificationActionButtonsProps {
  verification: VerificationResult;
  currentUserRole: 'buyer' | 'seller' | 'admin';
  currentUserAgentId: string;
  onStatusChange?: () => void;
}

const actionableStatuses = {
  seller: ['pending'] as VerificationStatus[],
  buyer: ['seller-completed', 'waiting-for-buyer'] as VerificationStatus[],
  admin: ['pending', 'seller-completed', 'waiting-for-buyer', 'rejected', 'disputed', 'error'] as VerificationStatus[],
};

export function VerificationActionButtons({
  verification,
  currentUserRole,
  currentUserAgentId,
  onStatusChange,
}: VerificationActionButtonsProps) {
  const { request, finalStatus, verdicts } = verification;
  const requestId = request.requestId;

  const canAct = actionableStatuses[currentUserRole].includes(finalStatus);

  const sellerCompletion = useSubmitSellerCompletion({
    onSuccess: () => {
      toast.success('Completion submitted successfully');
      onStatusChange?.();
    },
    onError: (error) => {
      toast.error(`Failed to submit completion: ${error.message}`);
    },
  });

  const buyerDecision = useSubmitBuyerDecision({
    onSuccess: (data) => {
      const status = data.record.verification?.status;
      toast.success(status === 'verified' ? 'Verification approved' : 'Verification rejected');
      onStatusChange?.();
    },
    onError: (error) => {
      toast.error(`Failed to submit decision: ${error.message}`);
    },
  });

  const adminOverride = useSubmitAdminOverride({
    onSuccess: (data) => {
      toast.success(`Admin override: ${data.record.verification?.status ?? 'applied'}`);
      onStatusChange?.();
    },
    onError: (error) => {
      toast.error(`Failed to submit override: ${error.message}`);
    },
  });

  const [showSellerForm, setShowSellerForm] = React.useState(false);
  const [showBuyerForm, setShowBuyerForm] = React.useState(false);
  const [showAdminForm, setShowAdminForm] = React.useState(false);
  const [sellerProof, setSellerProof] = React.useState('');
  const [sellerNotes, setSellerNotes] = React.useState('');
  const [buyerDecisionValue, setBuyerDecisionValue] = React.useState<'approve' | 'reject'>('approve');
  const [buyerRejectionReason, setBuyerRejectionReason] = React.useState('');
  const [buyerNotes, setBuyerNotes] = React.useState('');
  const [adminDecision, setAdminDecision] = React.useState<'verified' | 'rejected' | 'error'>('verified');
  const [adminRejectionReason, setAdminRejectionReason] = React.useState('');
  const [adminNotes, setAdminNotes] = React.useState('');

  const isLoading = sellerCompletion.isPending || buyerDecision.isPending || adminOverride.isPending;

  if (!canAct) {
    return null;
  }

  return (
    <Card className="border-[#3fb950]/30 bg-[#3fb950]/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-[#3fb950]" />
          Available Actions
        </CardTitle>
        <CardDescription>
          Actions available for your role: <span className="font-medium capitalize">{currentUserRole}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Seller Actions */}
        {currentUserRole === 'seller' && finalStatus === 'pending' && (
          <div className="space-y-4">
            {!showSellerForm ? (
              <Button
                onClick={() => setShowSellerForm(true)}
                className="w-full"
                size="lg"
                disabled={isLoading}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark as Completed
              </Button>
            ) : (
              <div className="space-y-4 p-4 bg-white/50 rounded-lg border border-[#333333]/14">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-black">Submit Completion Proof</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSellerForm(false)}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                </div>

                <Input
                  label="Proof (Required)"
                  placeholder="Transaction hash, delivery confirmation, API response, etc."
                  value={sellerProof}
                  onChange={(e) => setSellerProof(e.target.value)}
                  error={showSellerForm && sellerCompletion.isPending && !sellerProof ? 'Proof is required' : undefined}
                  disabled={isLoading}
                />

                <Textarea
                  label="Notes (Optional)"
                  placeholder="Additional context about completion..."
                  value={sellerNotes}
                  onChange={(e) => setSellerNotes(e.target.value)}
                  rows={3}
                  disabled={isLoading}
                />

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => {
                      if (!sellerProof.trim()) return;
                      sellerCompletion.mutate({
                        requestId,
                        sellerAgentId: currentUserAgentId,
                        proof: sellerProof,
                        notes: sellerNotes || undefined,
                      });
                    }}
                    disabled={isLoading || !sellerProof.trim()}
                    className="flex-1"
                  >
                    {sellerCompletion.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Completion'
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowSellerForm(false)}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Buyer Actions */}
        {currentUserRole === 'buyer' && (finalStatus === 'seller-completed' || finalStatus === 'waiting-for-buyer') && (
          <div className="space-y-4">
            {!showBuyerForm ? (
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setBuyerDecisionValue('approve');
                    setShowBuyerForm(true);
                  }}
                  className="flex-1"
                  size="lg"
                  disabled={isLoading}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setBuyerDecisionValue('reject');
                    setShowBuyerForm(true);
                  }}
                  className="flex-1"
                  size="lg"
                  disabled={isLoading}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </div>
            ) : (
              <div className="space-y-4 p-4 bg-white/50 rounded-lg border border-[#333333]/14">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-black">
                    {buyerDecisionValue === 'approve' ? 'Approve Verification' : 'Reject Verification'}
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowBuyerForm(false)}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                </div>

                {buyerDecisionValue === 'reject' && (
                  <>
                    <Input
                      label="Rejection Reason (Required)"
                      placeholder="Why are you rejecting this verification?"
                      value={buyerRejectionReason}
                      onChange={(e) => setBuyerRejectionReason(e.target.value)}
                      error={showBuyerForm && buyerDecision.isPending && buyerDecisionValue === 'reject' && !buyerRejectionReason ? 'Rejection reason is required' : undefined}
                      disabled={isLoading}
                    />
                    <Textarea
                      label="Notes (Optional)"
                      placeholder="Additional context..."
                      value={buyerNotes}
                      onChange={(e) => setBuyerNotes(e.target.value)}
                      rows={3}
                      disabled={isLoading}
                    />
                  </>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => {
                      if (buyerDecisionValue === 'reject' && !buyerRejectionReason.trim()) return;
                      buyerDecision.mutate({
                        requestId,
                        buyerAgentId: currentUserAgentId,
                        decision: buyerDecisionValue,
                        rejectionReason: buyerDecisionValue === 'reject' ? buyerRejectionReason : undefined,
                        notes: buyerNotes || undefined,
                      });
                    }}
                    disabled={isLoading || (buyerDecisionValue === 'reject' && !buyerRejectionReason.trim())}
                    className="flex-1"
                    variant={buyerDecisionValue === 'approve' ? 'default' : 'danger'}
                  >
                    {buyerDecision.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      buyerDecisionValue === 'approve' ? 'Approve' : 'Reject'
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowBuyerForm(false)}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Admin Actions */}
        {currentUserRole === 'admin' && (
          <div className="space-y-4">
            {!showAdminForm ? (
              <Button
                onClick={() => setShowAdminForm(true)}
                className="w-full"
                size="lg"
                variant="outline"
                disabled={isLoading}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Admin Override
              </Button>
            ) : (
              <div className="space-y-4 p-4 bg-white/50 rounded-lg border border-[#e03e3e]/30">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-black">Admin Override</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAdminForm(false)}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-black">Decision</label>
                  <div className="flex gap-2">
                    {(['verified', 'rejected', 'error'] as const).map((decision) => (
                      <Button
                        key={decision}
                        variant={adminDecision === decision ? 'default' : 'outline'}
                        onClick={() => setAdminDecision(decision)}
                        disabled={isLoading}
                        className="flex-1"
                      >
                        {decision.charAt(0).toUpperCase() + decision.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>

                {(adminDecision === 'rejected' || adminDecision === 'error') && (
                  <Input
                    label="Reason (Required for Reject/Error)"
                    placeholder="Provide reason for override..."
                    value={adminRejectionReason}
                    onChange={(e) => setAdminRejectionReason(e.target.value)}
                    error={showAdminForm && adminOverride.isPending && (adminDecision === 'rejected' || adminDecision === 'error') && !adminRejectionReason ? 'Reason is required' : undefined}
                    disabled={isLoading}
                  />
                )}

                <Textarea
                  label="Notes (Optional)"
                  placeholder="Additional context..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  disabled={isLoading}
                />

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => {
                      if ((adminDecision === 'rejected' || adminDecision === 'error') && !adminRejectionReason.trim()) return;
                      adminOverride.mutate({
                        requestId,
                        adminAgentId: currentUserAgentId,
                        decision: adminDecision,
                        rejectionReason: (adminDecision === 'rejected' || adminDecision === 'error') ? adminRejectionReason : undefined,
                        notes: adminNotes || undefined,
                      });
                    }}
                    disabled={isLoading || ((adminDecision === 'rejected' || adminDecision === 'error') && !adminRejectionReason.trim())}
                    className="flex-1"
                    variant="danger"
                  >
                    {adminOverride.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      `Override: ${adminDecision.charAt(0).toUpperCase() + adminDecision.slice(1)}`
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowAdminForm(false)}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Read-only status for other roles */}
        {(currentUserRole === 'seller' && finalStatus !== 'pending') && (
          <div className="p-4 bg-white/50 rounded-lg border border-[#333333]/14">
            <VerificationStatusBadge status={finalStatus} size="md" />
            <p className="text-sm text-[#5d5d5d] mt-2">
              {finalStatus === 'seller-completed' && 'Waiting for buyer decision...'}
              {finalStatus === 'waiting-for-buyer' && 'Waiting for buyer decision...'}
              {['verified', 'rejected', 'disputed'].includes(finalStatus) && 'Verification complete - no further action needed'}
            </p>
          </div>
        )}

        {(currentUserRole === 'buyer' && !['seller-completed', 'waiting-for-buyer'].includes(finalStatus)) && (
          <div className="p-4 bg-white/50 rounded-lg border border-[#333333]/14">
            <VerificationStatusBadge status={finalStatus} size="md" />
            <p className="text-sm text-[#5d5d5d] mt-2">
              {finalStatus === 'pending' && 'Waiting for seller to complete...'}
              {['verified', 'rejected', 'disputed'].includes(finalStatus) && 'Verification complete'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}