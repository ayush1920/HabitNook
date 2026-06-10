import { db } from './database';

export async function seedDummyData(userId: string = 'local', force = false) {
  const count = await db.habits.count();
  if (count > 0 && !force) return; // Only seed if empty, unless forced

  if (force) {
    console.log("Clearing tables for fresh seed...");
    await db.habits.clear();
    await db.entries.clear();
  }

  console.log("Seeding dummy data for user:", userId);

  const habitId = crypto.randomUUID();
  const habitId2 = crypto.randomUUID();
  const habitId3 = crypto.randomUUID();

  await db.habits.add({
    id: habitId,
    userId,
    name: "Morning Run",
    frequency: "daily",
    target: 1,
    type: "positive",
    icon: "🏃‍♂️",
    color: "#4ade80", // Success green
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archived: false
  });

  await db.habits.add({
    id: habitId2,
    userId,
    name: "Read 10 Pages",
    frequency: "daily",
    target: 10,
    type: "positive",
    icon: "📚",
    color: "#a78bfa", // Accent purple
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archived: false
  });

  // Limiting habit with quantity > 1 (e.g. Coffee Limit: max 2 cups/day)
  await db.habits.add({
    id: habitId3,
    userId,
    name: "Coffee Limit",
    frequency: "daily",
    target: 2,
    type: "limiting",
    icon: "☕",
    color: "#f97316", // Orange
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archived: false
  });

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 60);

  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0); // End of current month (e.g. June 30)
  
  let current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0];

    // Habit 1: Morning Run (Target 1, Daily)
    let val1 = 1;
    const random1 = Math.random();
    if (random1 < 0.1) val1 = 0; // Failed
    else if (random1 < 0.25) val1 = -1; // Skipped
    else val1 = 1; // Completed

    // Habit 2: Reading (Target 10, Daily)
    let val2 = 10;
    const random2 = Math.random();
    if (random2 < 0.1) val2 = 0; // 0 pages
    else if (random2 < 0.3) val2 = 5; // 5 pages (partial)
    else if (random2 < 0.4) val2 = -1; // Skipped
    else if (random2 < 0.6) val2 = 12; // Overachieved
    else val2 = 10; // Target

    // Habit 3: Coffee Limit (Target 2, Limiting, Daily)
    let val3 = 1;
    const random3 = Math.random();
    if (random3 < 0.1) val3 = -1; // Skipped
    else if (random3 < 0.3) val3 = 3; // Exceeded limit (failed)
    else if (random3 < 0.4) val3 = 4; // Exceeded limit a lot (failed)
    else if (random3 < 0.6) val3 = 0; // 0 cups (well under limit)
    else if (random3 < 0.8) val3 = 1; // 1 cup (under limit)
    else val3 = 2; // 2 cups (exactly on limit)

    await db.entries.put({
      id: crypto.randomUUID(),
      habitId: habitId,
      date: dateStr,
      value: val1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await db.entries.put({
      id: crypto.randomUUID(),
      habitId: habitId2,
      date: dateStr,
      value: val2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await db.entries.put({
      id: crypto.randomUUID(),
      habitId: habitId3,
      date: dateStr,
      value: val3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Advance 1 day
    current.setDate(current.getDate() + 1);
  }

  console.log("Dummy data seeded!");
}


