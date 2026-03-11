"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">
          Configure or add additional features. Super Admin only.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Feature configuration</CardTitle>
          <p className="text-sm text-slate-500">
            Toggle or configure system features. More options can be added here as needed.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border border-slate-100 p-4">
            <div>
              <Label className="font-medium text-slate-900">SLA reminder (48h)</Label>
              <p className="text-sm text-slate-500 mt-0.5">
                Notify managers when an order is approaching SLA deadline.
              </p>
            </div>
            <span className="text-sm text-slate-500">Active (system default)</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-100 p-4">
            <div>
              <Label className="font-medium text-slate-900">Audit logging</Label>
              <p className="text-sm text-slate-500 mt-0.5">
                Record all order actions for compliance.
              </p>
            </div>
            <span className="text-sm text-slate-500">Active (system default)</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-100 p-4">
            <div>
              <Label className="font-medium text-slate-900">Email notifications</Label>
              <p className="text-sm text-slate-500 mt-0.5">
                Send email on order events (requires SMTP configuration).
              </p>
            </div>
            <Button variant="outline" size="sm">Configure</Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-100 p-4">
            <div>
              <Label className="font-medium text-slate-900">Slack integration</Label>
              <p className="text-sm text-slate-500 mt-0.5">
                Post SLA alerts and key events to Slack.
              </p>
            </div>
            <Button variant="outline" size="sm">Configure</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
