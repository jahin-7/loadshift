export function generatorCost(generatorMinutes: number, litersPerHour: number, pricePerLiter: number): number {
  const hours = generatorMinutes / 60;
  const liters = hours * litersPerHour;
  return Math.round(liters * pricePerLiter * 100) / 100;
}
