import React from "react";

interface PlanCardProps {
  title?: string;
  description?: string;
  price?: string;
}

const PlanCard: React.FC<PlanCardProps> = ({ title = "Plan", description = "Descripción del plan", price = "$0" }) => {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 24, minWidth: 240, textAlign: "center", background: "#fff" }}>
      <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{title}</h3>
      <p style={{ color: "#6b7280", marginBottom: 16 }}>{description}</p>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#2563eb", marginBottom: 16 }}>{price}</div>
      <button style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 4, padding: "8px 20px", cursor: "pointer" }}>
        Seleccionar
      </button>
    </div>
  );
};

export default PlanCard;
