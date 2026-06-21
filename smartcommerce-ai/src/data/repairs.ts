import type { RepairType } from "../types";

export const repairs: RepairType[] = [
  {
    id: "repair-drill",
    toolType: "Cordless drill",
    commonIssues: ["Battery not charging", "Chuck stuck", "Trigger fault"],
    startingPrice: 39,
    turnaround: "2 to 4 business days"
  },
  {
    id: "repair-saw",
    toolType: "Circular saw",
    commonIssues: ["Blade wobble", "Motor noise", "Guard jammed"],
    startingPrice: 49,
    turnaround: "3 to 5 business days"
  },
  {
    id: "repair-generator",
    toolType: "Generator",
    commonIssues: ["Will not start", "Low output", "Service required"],
    startingPrice: 79,
    turnaround: "4 to 7 business days"
  }
];
