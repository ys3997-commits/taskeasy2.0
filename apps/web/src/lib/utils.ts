import { formatIstDate, formatIstDateTime } from "@rajshree/shared";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(value: string | null | undefined): string {
  return formatIstDateTime(value);
}

export function formatDate(value: string | null | undefined): string {
  return formatIstDate(value);
}

export function fullName(user: {
  first_name: string;
  last_name: string;
}): string {
  return `${user.first_name} ${user.last_name}`;
}
