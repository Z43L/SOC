import React from "react";
import { PlansList } from "../components/billing/PlansList";
import { SubscriptionStatus } from "../components/billing/SubscriptionStatus";

export default function BillingPage() {
  return (
    <div>
      <h1>Facturación y Suscripciones</h1>
      <SubscriptionStatus />
      <PlansList />
    </div>
  );
}
