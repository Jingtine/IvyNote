import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "./App";

test("renders the Local Knowledge IDE shell", () => {
  render(<App />);
  expect(screen.getByRole("application", { name: "Local Knowledge IDE" })).toBeInTheDocument();
  expect(screen.getByText("Open a local folder to begin")).toBeInTheDocument();
});
