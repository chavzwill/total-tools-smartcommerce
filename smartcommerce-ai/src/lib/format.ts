export const money = (value: number) => `J$${value.toLocaleString("en-JM")}`;
export const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
