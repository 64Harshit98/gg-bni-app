# Billing and Inventory Management App

This project is a comprehensive application designed to streamline inventory tracking, manage point-of-sale transactions, and generate insightful reports. It's built with a modern web stack, focusing on a responsive and intuitive user experience.

---

## Table of Contents

- [Features](#features)
- [Technologies Used](#technologies-used)
- [Installation](#installation)
- [Usage](#usage)
- [Scripts](#scripts)
- [Project Structure](#project-structure)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

---

## Features

- **Real-time Inventory Tracking:** Keep an up-to-date record of all products, quantities, and stock levels.
- **Point-of-Sale (POS) System:** Efficiently process sales transactions, calculate totals, and apply discounts.
- **User Authentication:** Secure user access and management using Firebase Authentication.
- **Reporting & Analytics:** Generate reports on sales, inventory movement, and other key metrics for business insights.
- **Responsive Design:** Ensures a seamless experience across various devices (desktops, tablets, mobiles).
- **Intuitive User Interface:** Designed for ease of use, making complex tasks simple.
- _(Add more specific features here, e.g., "Product Search and Filtering," "Customer Management," "Barcode Scanning Integration," "Invoice Generation," "Multi-user Roles")_

---

## Technologies Used

- **[React.js](https://react.dev/)**: A JavaScript library for building user interfaces.
- **[TypeScript](https://www.typescriptlang.org/)**: A superset of JavaScript that adds static types, enhancing code quality and maintainability.
- **[Vite](https://vitejs.dev/)**: A blazing fast build tool for modern web projects, used for rapid development and optimized builds.
- **[Tailwind CSS](https://tailwindcss.com/)**: A utility-first CSS framework for rapidly building custom designs.
- **[RTK Query](https://redux-toolkit.js.org/rtk-query/overview)**: A powerful data fetching and caching tool built on top of Redux Toolkit.
- **[React Router DOM](https://reactrouter.com/web/guides/quick-start)**: A standard library for routing in React.
- **[React Icons](https://react-icons.github.io/react-icons/)**: A small library that helps you add icons to your React apps.
- **[ESLint](https://eslint.org/)**: A tool for identifying and reporting on patterns found in ECMAScript/JavaScript code.
- **[Prettier](https://prettier.io/)**: An opinionated code formatter.

---

## Installation

To get a local copy up and running, follow these simple steps.

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/your-username/gg-bni-app.git](https://github.com/your-username/gg-bni-app.git)
    ```
2.  **Navigate to the project directory:**
    ```bash
    cd gg-bni-app
    ```
3.  **Install dependencies:**
    ```bash
    npm install  # or yarn install or pnpm install
    ```
4.  **Set up Firebase Configuration:**
    - Create a new Firebase project in the [Firebase Console](https://console.firebase.google.com/).
    - Enable **Firestore Database** and **Firebase Authentication** (e.g., Email/Password, Google Sign-In).
    - Go to Project Settings -> Your apps -> Web (the `</>` icon) to get your Firebase configuration.
    - Create a `.env` file in the root of your project and add your Firebase configuration variables. Example:
      ```dotenv
      VITE_FIREBASE_API_KEY=YOUR_API_KEY
      VITE_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
      VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
      VITE_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET
      VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
      VITE_FIREBASE_APP_ID=YOUR_APP_ID
      VITE_FIREBASE_MEASUREMENT_ID=YOUR_MEASUREMENT_ID # Optional, if using Analytics
      ```
    - _Ensure these variables are correctly loaded in your React app (Vite prefixes `VITE_` for client-side environment variables).\_

---

## Usage

Once the development server is running, you can interact with the application through your web browser.

1.  **Start the development server:**

    ```bash
    npm run dev  # or yarn dev or pnpm dev
    ```

    This will typically open your application in your browser at `http://localhost:5173` (or another port).

2.  **Access the application:**
    Open your web browser and navigate to the address provided in your terminal (e.g., `http://localhost:5173`).

3.  **Initial Setup / Login:**
    - If you have Firebase Authentication configured, you'll likely be prompted to sign up or log in.
    - Follow the on-screen instructions to create an account or use existing credentials.
    - _Describe any initial steps a user might need to take, like adding their first products or setting up business details._

### Production Build

To create an optimized production build of the application:

```bash
npm run build # or yarn build or pnpm build
```

---

## Project Structure

```
/
├── public/
│   └── vite.svg
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── MainLayout.tsx
│   │   └── index.ts
│   ├── assets/
│   ├── Components/
│   │   └── index.tsx
│   ├── Pages/
│   │   ├── Account.tsx
│   │   ├── Home.tsx
│   │   ├── Journal.tsx
│   │   ├── Masters.tsx
│   │   ├── Reports.tsx
│   │   ├── Master/
│   │   │   ├── ItemAdd.tsx
│   │   │   ├── ItemGroup.tsx
│   │   │   ├── MastersLayout.tsx
│   │   │   ├── Payment.tsx
│   │   │   ├── Purchase.tsx
│   │   │   ├── PurchaseReturn.tsx
│   │   │   ├── Sales.tsx
│   │   │   ├── SalesReturn.tsx
│   │   │   └── UserAdd.tsx
│   │   └── index.tsx
│   ├── routes/
│   │   └── routes.tsx
│   ├── store/
│   │   ├── api.ts
│   │   └── store.ts
│   ├── global.css
│   ├── main.tsx
│   └── vite-env.d.ts
├── .env
├── .firebaserc
├── .gitignore
├── .prettierignore
├── .prettierrc
├── eslint.config.js
├── firebase.json
├── index.html
├── package-lock.json
├── package.json
├── README.md
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

---

## Commit Message Guidelines

This project uses `commitizen` and `husky` to enforce a consistent commit message format and to run linters before committing. This ensures that our commit history is readable and that our code stays clean.

### Setup

The following tools are used:

- **[Commitizen](http://commitizen.github.io/cz-cli/)**: A tool to create conventional commit messages.
- **[cz-customizable](https://github.com/leoforfree/cz-customizable)**: A customizable adapter for `commitizen` that allows us to define our own commit message format.
- **[Husky](https://typicode.github.io/husky/)**: A tool that makes it easy to work with Git hooks.
- **[lint-staged](https://github.com/okonet/lint-staged)**: A tool to run linters on staged files.

### How to Commit

To commit your changes, simply use the standard `git commit` command:

```bash
git commit
```

A `prepare-commit-msg` hook has been set up to automatically launch an interactive prompt that will guide you through creating a commit message that follows our conventions.

### Pre-commit Hook

Before each commit, a `pre-commit` hook will run `lint-staged`. This will:

1.  Run `eslint` to check for any linting errors in the staged files.
2.  Run `prettier` to format the staged files.

If either of these checks fails, the commit will be aborted. You will need to fix the errors and stage the files again before you can commit.
