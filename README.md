# Orbit Habit Tracker

A beautiful, local-first habit tracking application designed with intention. Orbit helps you build and maintain habits with a premium, dynamic interface, rich data visualization, and completely local storage.

## Features

- **Local-First Architecture:** All your data is stored locally in your browser using IndexedDB. No accounts, no subscriptions, no cloud syncing delays.
- **Premium Design:** Crafted with a carefully selected dark-mode color palette, smooth gradients, glassmorphism, and micro-animations for an exceptional user experience.
- **Advanced Tracking:** Supports multiple habit frequencies (Daily, Weekly, Monthly) and different target types (Simple Completion or Numeric Targets).
- **Rich Analytics:** View comprehensive trends, moving averages, and historical data to keep track of your progress over time.
- **Flexible Logging:** Easy-to-use logging interface with support for partial completions and skipping days without penalizing your streak.

## Tech Stack

- **Framework:** [React](https://reactjs.org/) & [Vite](https://vitejs.dev/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Database:** [Dexie.js](https://dexie.org/) (IndexedDB wrapper)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Charts:** [Recharts](https://recharts.org/)
- **Date Handling:** [date-fns](https://date-fns.org/)

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or pnpm

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd habbit_tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

## Design Philosophy

Orbit is built on the principle that habit tracking should feel rewarding and frictionless. The interface prioritizes:
- **Visual Feedback:** Immediate visual confirmation of actions through animations and color state changes.
- **Data Clarity:** Complex data is distilled into easy-to-read sparklines and trend indicators.
- **Frictionless Interaction:** Logging a habit takes as few clicks as possible, with smart defaults based on the current date and habit frequency.

## License

MIT
