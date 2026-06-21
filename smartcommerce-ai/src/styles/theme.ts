export const theme = {
  colors: {
    green: "#075537",
    greenDark: "#033923",
    yellow: "#f5c928",
    white: "#ffffff",
    gray50: "#f6f8f6",
    gray100: "#edf1ee",
    gray300: "#d4ddd7",
    gray600: "#647269",
    charcoal: "#18211c"
  },
  radius: {
    small: "8px",
    medium: "14px",
    large: "22px"
  },
  shadow: {
    soft: "0 12px 32px rgba(11, 49, 31, 0.08)",
    elevated: "0 22px 56px rgba(11, 49, 31, 0.12)"
  }
} as const;

export const company = {
  name: "Total Tools Jamaica",
  subtitle: "Sales | Rentals | Repairs | Electrical Supplies",
  whatsapp: "(876) 834-5300",
  phone: "(876) 508-9089",
  email: "sales@totaltoolsja.com",
  branches: [
    { name: "Ocho Rios", address: "102 Main Street, Ocho Rios, P.O. St. Ann" },
    { name: "Kingston", address: "34 Slipe Road, Kingston 5" },
    { name: "Drax Hall", address: "Lot C6, Drax Hall, St. Ann" }
  ]
} as const;
