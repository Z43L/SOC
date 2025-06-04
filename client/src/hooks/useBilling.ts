import { useState, useEffect } from "react";

export function useBilling() {
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/billing/plans")
      .then(res => res.json())
      .then(data => setPlans(data.plans || []));
    fetch("/api/billing/subscription")
      .then(res => res.json())
      .then(data => setSubscription(data.data || null))
      .finally(() => setLoading(false));
  }, []);

  const createCheckoutSession = async (planId: number, isYearly: boolean) => {
    const res = await fetch("/api/billing/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, isYearly }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  };

  const openBillingPortal = async () => {
    const res = await fetch("/api/billing/create-billing-portal-session", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  };

  return { plans, subscription, loading, createCheckoutSession, openBillingPortal };
}
