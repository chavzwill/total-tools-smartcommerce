export const theme = {
  colors: {
    green: "#08763f",
    greenDark: "#066a39",
    yellow: "#f5c928",
    white: "#ffffff",
    gray50: "#f7f8f5",
    gray100: "#edf1ec",
    gray300: "#d6ddd5",
    gray600: "#657066",
    charcoal: "#18211c"
  },
  radius: {
    small: "8px",
    medium: "14px",
    large: "22px"
  },
  shadow: {
    soft: "0 12px 32px rgba(24, 33, 28, 0.08)",
    elevated: "0 22px 56px rgba(24, 33, 28, 0.12)"
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
