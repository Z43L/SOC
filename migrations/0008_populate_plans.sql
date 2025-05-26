-- Populate Plans
-- First, check if plans already exist to avoid duplicates
DO $$
BEGIN
    -- Free Plan
    IF NOT EXISTS (SELECT 1 FROM "plans" WHERE "name" = 'Free') THEN
        INSERT INTO "plans" (
            "name", 
            "description", 
            "price_monthly", 
            "price_yearly", 
            "features", 
            "max_users", 
            "max_agents", 
            "max_alerts",
            "is_active",
            "created_at", 
            "updated_at"
        ) VALUES (
            'Free', 
            'Basic SOC capabilities for individuals or small teams',
            0, 
            0, 
            '[
                "Basic Dashboard",
                "1 Agent",
                "Basic Threat Detection",
                "24 Hour Alert History",
                "Email Support"
            ]'::jsonb,
            2,
            1,
            100,
            true,
            NOW(), 
            NOW()
        );
    END IF;

    -- Pro Plan
    IF NOT EXISTS (SELECT 1 FROM "plans" WHERE "name" = 'Pro') THEN
        INSERT INTO "plans" (
            "name", 
            "description", 
            "price_monthly", 
            "price_yearly", 
            "features", 
            "max_users", 
            "max_agents", 
            "max_alerts",
            "is_active",
            "stripe_price_id_monthly",
            "stripe_price_id_yearly",
            "created_at", 
            "updated_at"
        ) VALUES (
            'Pro', 
            'Advanced SOC capabilities with unlimited agents',
            4900, 
            49000, 
            '[
                "Advanced Dashboard",
                "Unlimited Agents",
                "Advanced Threat Detection & AI Analysis",
                "90 Day Alert History", 
                "Custom Playbooks",
                "Priority Support",
                "Threat Intelligence Integration",
                "Compliance Reporting"
            ]'::jsonb,
            10,
            -1,
            -1,
            true,
            'price_monthly_pro_placeholder',
            'price_yearly_pro_placeholder',
            NOW(), 
            NOW()
        );
    END IF;

    -- Enterprise Plan
    IF NOT EXISTS (SELECT 1 FROM "plans" WHERE "name" = 'Enterprise') THEN
        INSERT INTO "plans" (
            "name", 
            "description", 
            "price_monthly", 
            "price_yearly", 
            "features", 
            "max_users", 
            "max_agents", 
            "max_alerts",
            "is_active",
            "stripe_price_id_monthly",
            "stripe_price_id_yearly",
            "created_at", 
            "updated_at"
        ) VALUES (
            'Enterprise', 
            'Enterprise-grade security operations with dedicated support',
            9900, 
            99000, 
            '[
                "Complete Dashboard",
                "Unlimited Agents",
                "Enterprise Threat Detection & AI Analysis",
                "1 Year Alert History", 
                "Custom Playbooks & Integrations",
                "24/7 Dedicated Support",
                "Advanced Threat Intelligence",
                "Compliance & Regulatory Reporting",
                "White-labeling Options",
                "API Access"
            ]'::jsonb,
            -1,
            -1,
            -1,
            true,
            'price_monthly_enterprise_placeholder',
            'price_yearly_enterprise_placeholder',
            NOW(), 
            NOW()
        );
    END IF;
END
$$;