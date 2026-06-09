import { startOfWeek, differenceInDays } from 'date-fns';

const startDate = new Date();
startDate.setMonth(startDate.getMonth() - 1);
const endDate = new Date(); // e.g. June 9 21:38

const getExpectedForRange = (rStart: Date, rEnd: Date) => {
  const days = differenceInDays(rEnd, rStart) + 1;
  console.log(`[getExpectedForRange] rStart: ${rStart.toLocaleString()}, rEnd: ${rEnd.toLocaleString()}, days: ${days}`);
  if (days <= 0) return 0;
  return 5 * (days / 7); // habit.target = 5
};

let curr = startOfWeek(startDate, { weekStartsOn: 1 });
const finalEnd = startOfWeek(endDate, { weekStartsOn: 1 });
while (curr <= finalEnd) {
  const endOfWeek = new Date(curr);
  endOfWeek.setDate(endOfWeek.getDate() + 6);
  const actualEnd = endOfWeek > endDate ? endDate : endOfWeek;
  const expected = Number(getExpectedForRange(curr, actualEnd).toFixed(1));
  console.log(`[weekly] curr: ${curr.toLocaleString()}, endOfWeek: ${endOfWeek.toLocaleString()}, actualEnd: ${actualEnd.toLocaleString()}, expected: ${expected}`);
  curr.setDate(curr.getDate() + 7);
}
