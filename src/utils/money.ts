/**
 * Calculates the number of nights for a stay between two calendar dates (YYYY-MM-DD).
 * Stay is treated as a half-open interval [checkIn, checkOut).
 */
export function calculateNights(checkIn: string, checkOut: string): number {
  const [inYear, inMonth, inDay] = checkIn.split('-').map(Number) as [number, number, number];
  const [outYear, outMonth, outDay] = checkOut.split('-').map(Number) as [number, number, number];

  const inUtc = Date.UTC(inYear, inMonth - 1, inDay);
  const outUtc = Date.UTC(outYear, outMonth - 1, outDay);

  const diffMs = outUtc - inUtc;
  const nights = Math.round(diffMs / 86400000);

  if (nights <= 0) {
    throw new Error(`Invalid stay duration: check_out (${checkOut}) must be after check_in (${checkIn})`);
  }

  return nights;
}

/**
 * Calculates total price in USD cents given nights and price per night in cents.
 */
export function calculateTotalPriceCents(nights: number, pricePerNightCents: number): number {
  if (nights <= 0) {
    throw new Error('Nights must be greater than zero');
  }
  if (pricePerNightCents < 0) {
    throw new Error('Price per night cannot be negative');
  }
  return nights * pricePerNightCents;
}

/**
 * Formats integer cents into a USD display string, e.g. 22000 -> "$220.00 USD".
 */
export function formatUsd(cents: number): string {
  const dollars = (cents / 100).toFixed(2);
  return `$${dollars} USD`;
}
