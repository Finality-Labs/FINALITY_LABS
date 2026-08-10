/**
 * Finality Labs - Settings Page
 * Application settings and configuration
 */

'use client';

import * as React from 'react';
import { useState } from 'react';
import { Save, Loader2, Key, Shield, Bell, Palette, Globe, Database, Terminal, Trash2, AlertTriangle } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Input,
  Select,
  Separator,
  Switch,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Label,
  toast,
} from '@/components/ui';
import { PageContainer, Section } from '@/components/layout';
import { cn } from '@/lib/utils';

// ============================================
// Settings Page
// ============================================

export default function SettingsPage() {
  const [isSaving, setIsSaving] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'general' | 'notifications' | 'security' | 'appearance' | 'advanced'>('general');

  // Form states
  const [generalSettings, setGeneralSettings] = React.useState({
    defaultAgentId: '1',
    defaultWallet: '0x1111111111111111111111111111111111111111',
    defaultRegistry: 'eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e',
    autoConnect: true,
    defaultResource: 'gpu',
    defaultUnit: 'hour',
  });

  const [notificationSettings, setNotificationSettings] = React.useState({
    emailDeals: true,
    emailNegotiations: true,
    emailSettlements: true,
    emailReputation: false,
    pushDeals: true,
    pushNegotiations: true,
    pushSettlements: true,
    pushReputation: false,
    desktopNotifications: true,
    soundEnabled: false,
  });

  const [securitySettings, setSecuritySettings] = React.useState({
    twoFactorEnabled: false,
    sessionTimeout: 30,
    autoLock: true,
    showWalletAddresses: false,
    confirmTransactions: true,
    apiKeys: [] as string[],
  });

  const [appearanceSettings, setAppearanceSettings] = React.useState({
    theme: 'light' as 'light' | 'dark' | 'system',
    compactMode: false,
    animationsEnabled: true,
    reducedMotion: false,
    fontSize: 'medium' as 'small' | 'medium' | 'large',
  });

  const [advancedSettings, setAdvancedSettings] = React.useState({
    debugMode: false,
    logLevel: 'info' as 'debug' | 'info' | 'warn' | 'error',
    wsReconnectAttempts: 5,
    wsReconnectDelay: 1000,
    requestTimeout: 30000,
    enableTelemetry: false,
  });

  const handleSave = async (settings: any, tabName: string) => {
    setIsSaving(true);
    try {
      // In real app, save to API/localStorage
      await new Promise(r => setTimeout(r, 500));
      toast.success(`${tabName} settings saved`);
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = (tabName: string) => {
    toast.info(`${tabName} settings reset to defaults`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageContainer
        title="Settings"
        description="Configure your preferences and application behavior"
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value: string) =>
  setActiveTab(
    value as "general" | "notifications" | "appearance" | "security" | "advanced"
  )
} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general"><Globe className="h-4 w-4 mr-2" />General</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-2" />Notifications</TabsTrigger>
          <TabsTrigger value="security"><Shield className="h-4 w-4 mr-2" />Security</TabsTrigger>
          <TabsTrigger value="appearance"><Palette className="h-4 w-4 mr-2" />Appearance</TabsTrigger>
          <TabsTrigger value="advanced"><Terminal className="h-4 w-4 mr-2" />Advanced</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Default values for creating intents and offers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Default Agent ID"
                  value={generalSettings.defaultAgentId}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, defaultAgentId: e.target.value })}
                  placeholder="ResearchBot"
                />
                <Input
                  label="Default Wallet"
                  value={generalSettings.defaultWallet}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, defaultWallet: e.target.value })}
                  placeholder="0x..."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Default Registry"
                  value={generalSettings.defaultRegistry}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, defaultRegistry: e.target.value })}
                  placeholder="eip155:84532:0x..."
                />
                <Select
                  label="Default Resource"
                  value={generalSettings.defaultResource}
                  onValueChange={(value) =>
  setGeneralSettings({
    ...generalSettings,
    defaultResource: value,
  })
}
                  options={[
                    { value: 'gpu', label: 'GPU Compute' },
                    { value: 'cpu', label: 'CPU Compute' },
                    { value: 'storage', label: 'Storage' },
                    { value: 'bandwidth', label: 'Bandwidth' },
                    { value: 'memory', label: 'Memory' },
                  ]}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="Default Unit"
                  value={generalSettings.defaultUnit}
                  onValueChange={(value) =>
  setGeneralSettings({
    ...generalSettings,
    defaultUnit: value,
  })
}
                  options={[
                    { value: 'hour', label: 'Hour' },
                    { value: 'day', label: 'Day' },
                    { value: 'week', label: 'Week' },
                    { value: 'month', label: 'Month' },
                    { value: 'GB', label: 'GB' },
                    { value: 'TB', label: 'TB' },
                  ]}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-connect to services</Label>
                  <p className="text-sm text-[#5d5d5d]">Automatically connect to backend services on page load</p>
                </div>
                <Switch
                  checked={generalSettings.autoConnect}
                  onCheckedChange={(checked) => setGeneralSettings({ ...generalSettings, autoConnect: checked })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-[#333333]/14">
                <Button variant="secondary" onClick={() => handleReset('General')}>Reset</Button>
                <Button onClick={() => handleSave(generalSettings, 'General')} loading={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Settings */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Configure how and when you receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <h4 className="font-medium">Email Notifications</h4>
              <div className="space-y-3">
                {[
                  { key: 'emailDeals', label: 'Deal Completed', description: 'When a negotiation reaches a deal' },
                  { key: 'emailNegotiations', label: 'Negotiation Started', description: 'When a new negotiation begins' },
                  { key: 'emailSettlements', label: 'Settlement Complete', description: 'When on-chain settlement finishes' },
                  { key: 'emailReputation', label: 'Reputation Changes', description: 'When your reputation score updates' },
                ].map(({ key, label, description }) => (
                  <div key={key} className="flex items-center justify-between p-3 bg-white/50 border border-[#333333]/14">
                    <div>
                      <Label>{label}</Label>
                      <p className="text-sm text-[#5d5d5d]">{description}</p>
                    </div>
                    <Switch
                      checked={notificationSettings[key as keyof typeof notificationSettings]}
                      onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, [key]: checked })}
                    />
                  </div>
                ))}
              </div>

              <Separator />

              <h4 className="font-medium">Push Notifications</h4>
              <div className="space-y-3">
                {[
                  { key: 'pushDeals', label: 'Deal Completed' },
                  { key: 'pushNegotiations', label: 'Negotiation Started' },
                  { key: 'pushSettlements', label: 'Settlement Complete' },
                  { key: 'pushReputation', label: 'Reputation Changes' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between p-3 bg-white/50 border border-[#333333]/14">
                    <Label>{label}</Label>
                    <Switch
                      checked={notificationSettings[key as keyof typeof notificationSettings]}
                      onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, [key]: checked })}
                    />
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white/50 border border-[#333333]/14">
                  <div>
                    <Label>Desktop Notifications</Label>
                    <p className="text-sm text-[#5d5d5d]">Show browser notifications for events</p>
                  </div>
                  <Switch
                    checked={notificationSettings.desktopNotifications}
                    onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, desktopNotifications: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-white/50 border border-[#333333]/14">
                  <div>
                    <Label>Sound Effects</Label>
                    <p className="text-sm text-[#5d5d5d]">Play sounds for notifications</p>
                  </div>
                  <Switch
                    checked={notificationSettings.soundEnabled}
                    onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, soundEnabled: checked })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[#333333]/14">
                <Button variant="secondary" onClick={() => handleReset('Notifications')}>Reset</Button>
                <Button onClick={() => handleSave(notificationSettings, 'Notifications')} loading={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Account security and privacy settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white/50 border border-[#333333]/14">
                  <div>
                    <Label>Two-Factor Authentication</Label>
                    <p className="text-sm text-[#5d5d5d]">Add an extra layer of security to your account</p>
                  </div>
                  <Switch
                    checked={securitySettings.twoFactorEnabled}
                    onCheckedChange={(checked) => setSecuritySettings({ ...securitySettings, twoFactorEnabled: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-white/50 border border-[#333333]/14">
                  <div>
                    <Label>Auto-lock Session</Label>
                    <p className="text-sm text-[#5d5d5d]">Lock session after inactivity</p>
                  </div>
                  <Switch
                    checked={securitySettings.autoLock}
                    onCheckedChange={(checked) => setSecuritySettings({ ...securitySettings, autoLock: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-white/50 border border-[#333333]/14">
                  <div>
                    <Label>Show Wallet Addresses</Label>
                    <p className="text-sm text-[#5d5d5d]">Display full wallet addresses in UI</p>
                  </div>
                  <Switch
                    checked={securitySettings.showWalletAddresses}
                    onCheckedChange={(checked) => setSecuritySettings({ ...securitySettings, showWalletAddresses: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-white/50 border border-[#333333]/14">
                  <div>
                    <Label>Confirm Transactions</Label>
                    <p className="text-sm text-[#5d5d5d]">Require confirmation before submitting transactions</p>
                  </div>
                  <Switch
                    checked={securitySettings.confirmTransactions}
                    onCheckedChange={(checked) => setSecuritySettings({ ...securitySettings, confirmTransactions: checked })}
                  />
                </div>
              </div>

              <Separator />

              <div>
                <Label>Session Timeout (minutes)</Label>
                <Input
                  type="number"
                  min="5"
                  max="480"
                  value={securitySettings.sessionTimeout}
                  onChange={(e) => setSecuritySettings({ ...securitySettings, sessionTimeout: parseInt(e.target.value) })}
                  className="w-full max-w-xs mt-2"
                />
              </div>

              <Separator />

              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label>API Keys</Label>
                  <Button variant="outline" size="sm">
                    <Key className="h-4 w-4 mr-2" />
                    Generate New Key
                  </Button>
                </div>
                {securitySettings.apiKeys.length === 0 ? (
                  <p className="text-sm text-[#5d5d5d]">No API keys generated yet</p>
                ) : (
                  <div className="space-y-2">
                    {securitySettings.apiKeys.map((key, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-white/50 border border-[#333333]/14">
                        <code className="text-sm font-mono">{key}</code>
                        <Button variant="ghost" size="sm" onClick={() => {
                          const newKeys = [...securitySettings.apiKeys];
                          newKeys.splice(index, 1);
                          setSecuritySettings({ ...securitySettings, apiKeys: newKeys });
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[#333333]/14">
                <Button variant="secondary" onClick={() => handleReset('Security')}>Reset</Button>
                <Button onClick={() => handleSave(securitySettings, 'Security')} loading={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Settings */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Customize the look and feel of the application</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="Theme"
                  value={appearanceSettings.theme}
                  onValueChange={(value) =>
  setAppearanceSettings({
    ...appearanceSettings,
    theme: value as 'light' | 'dark' | 'system',
  })
}
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'system', label: 'System' },
                  ]}
                />
                <Select
                  label="Font Size"
                  value={appearanceSettings.fontSize}
                  onValueChange={(value) =>
  setAppearanceSettings({
    ...appearanceSettings,
    fontSize: value as 'small' | 'medium' | 'large',
  })
}
                  options={[
                    { value: 'small', label: 'Small' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'large', label: 'Large' },
                  ]}
                />
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white/50 border border-[#333333]/14">
                  <div>
                    <Label>Compact Mode</Label>
                    <p className="text-sm text-[#5d5d5d]">Reduce spacing for denser layouts</p>
                  </div>
                  <Switch
                    checked={appearanceSettings.compactMode}
                    onCheckedChange={(checked) => setAppearanceSettings({ ...appearanceSettings, compactMode: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-white/50 border border-[#333333]/14">
                  <div>
                    <Label>Animations</Label>
                    <p className="text-sm text-[#5d5d5d]">Enable UI animations and transitions</p>
                  </div>
                  <Switch
                    checked={appearanceSettings.animationsEnabled}
                    onCheckedChange={(checked) => setAppearanceSettings({ ...appearanceSettings, animationsEnabled: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-white/50 border border-[#333333]/14">
                  <div>
                    <Label>Reduced Motion</Label>
                    <p className="text-sm text-[#5d5d5d]">Minimize animations for accessibility</p>
                  </div>
                  <Switch
                    checked={appearanceSettings.reducedMotion}
                    onCheckedChange={(checked) => setAppearanceSettings({ ...appearanceSettings, reducedMotion: checked })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[#333333]/14">
                <Button variant="secondary" onClick={() => handleReset('Appearance')}>Reset</Button>
                <Button onClick={() => handleSave(appearanceSettings, 'Appearance')} loading={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Settings */}
        <TabsContent value="advanced">
          <Card>
            <CardHeader>
              <CardTitle>Advanced</CardTitle>
              <CardDescription>Developer and debugging options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white/50 border border-[#333333]/14">
                  <div>
                    <Label>Debug Mode</Label>
                    <p className="text-sm text-[#5d5d5d]">Enable verbose logging and debug tools</p>
                  </div>
                  <Switch
                    checked={advancedSettings.debugMode}
                    onCheckedChange={(checked) => setAdvancedSettings({ ...advancedSettings, debugMode: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-white/50 border border-[#333333]/14">
                  <div>
                    <Label>Enable Telemetry</Label>
                    <p className="text-sm text-[#5d5d5d]">Send anonymous usage data to improve the product</p>
                  </div>
                  <Switch
                    checked={advancedSettings.enableTelemetry}
                    onCheckedChange={(checked) => setAdvancedSettings({ ...advancedSettings, enableTelemetry: checked })}
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="Log Level"
                  value={advancedSettings.logLevel}
                  onValueChange={(value) =>
  setAdvancedSettings({
    ...advancedSettings,
    logLevel: value as 'debug' | 'info' | 'warn' | 'error',
  })
}
                  options={[
                    { value: 'debug', label: 'Debug' },
                    { value: 'info', label: 'Info' },
                    { value: 'warn', label: 'Warn' },
                    { value: 'error', label: 'Error' },
                  ]}
                />
                <Input
                  label="WS Reconnect Attempts"
                  type="number"
                  min="1"
                  max="20"
                  value={advancedSettings.wsReconnectAttempts}
                  onChange={(e) => setAdvancedSettings({ ...advancedSettings, wsReconnectAttempts: parseInt(e.target.value) })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="WS Reconnect Delay (ms)"
                  type="number"
                  min="100"
                  max="10000"
                  step="100"
                  value={advancedSettings.wsReconnectDelay}
                  onChange={(e) => setAdvancedSettings({ ...advancedSettings, wsReconnectDelay: parseInt(e.target.value) })}
                />
                <Input
                  label="Request Timeout (ms)"
                  type="number"
                  min="5000"
                  max="120000"
                  step="1000"
                  value={advancedSettings.requestTimeout}
                  onChange={(e) => setAdvancedSettings({ ...advancedSettings, requestTimeout: parseInt(e.target.value) })}
                />
              </div>

              <Separator />

              <div className="p-4 bg-[#e03e3e]/10 border border-[#e03e3e]/30">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-[#e03e3e]" />
                  <div>
                    <h4 className="font-medium text-[#e03e3e]">Danger Zone</h4>
                    <p className="text-sm text-[#5d5d5d]">These actions are irreversible</p>
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <Button variant="danger" onClick={() => toast.error('This is a demo - no data will be cleared')}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear All Local Data
                  </Button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[#333333]/14">
                <Button variant="secondary" onClick={() => handleReset('Advanced')}>Reset</Button>
                <Button onClick={() => handleSave(advancedSettings, 'Advanced')} loading={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}